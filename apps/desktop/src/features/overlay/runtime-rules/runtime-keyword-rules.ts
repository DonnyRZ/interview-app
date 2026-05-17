import type { RealtimeContext } from "@interview-app/shared";
import { isDomainRelatedText, isLikelyTranscriptNoise } from "./transcript-focus-rules.js";

export type RuntimeKeywordContext = {
  realtimeContext?: RealtimeContext;
};

export function buildKeywordSourceText(latestQuestion: string, recentTranscript: string) {
  const normalizedQuestion = latestQuestion.trim();
  const transcriptSegments = recentTranscript
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(-4);
  const parts = [...transcriptSegments, normalizedQuestion].filter(Boolean);
  return Array.from(new Set(parts)).join("\n").trim();
}

export function buildLocalRuntimeKeywords(question: string, context: RuntimeKeywordContext, sourceText = question) {
  const profile = context.realtimeContext?.domainProfile;
  if (!profile) {
    return [];
  }

  const questionTokens = tokenizeText(question);
  const sourceTokens = tokenizeText(sourceText);
  if ((!questionTokens.size && !sourceTokens.size) || isLikelyTranscriptNoise(sourceText)) {
    return [];
  }

  const contextConcepts = uniqueKeywords([
    context.realtimeContext?.applicationContext.roleTitle || "",
    profile.primaryDomain,
    profile.nicheDescription,
    ...profile.seedConcepts,
    ...profile.inScopeConcepts,
    ...(context.realtimeContext?.applicationContext.roleRequirements || []),
    ...(context.realtimeContext?.applicationContext.responsibilities || []),
    ...(context.realtimeContext?.applicationContext.niceToHave || []),
    ...(context.realtimeContext?.candidateContext.skills || []),
    ...(context.realtimeContext?.stageContext.focus || [])
  ]);

  const contextTokens = tokenizeText(contextConcepts.join(" "));
  const outOfScopeHit = profile.outOfScopeConcepts.some((concept) => scoreConcept(concept, sourceText, sourceTokens) >= 3);
  const contextHit = contextConcepts.some((concept) => {
    const questionScore = questionTokens.size ? scoreConcept(concept, question, questionTokens) : 0;
    const sourceScore = sourceTokens.size ? scoreConcept(concept, sourceText, sourceTokens) : 0;
    return questionScore >= 1 || sourceScore >= 2;
  });
  if (outOfScopeHit && !contextHit) {
    return [];
  }

  const sourceIsRelevant = contextHit || isDomainRelatedText(question, context) || isDomainRelatedText(sourceText, context);
  const hasGeneralProfessionalSignal = hasGeneralProfessionalRelevance(question) || hasGeneralProfessionalRelevance(sourceText);
  const allowStandaloneCandidates = sourceIsRelevant || hasGeneralProfessionalSignal;
  const questionCandidates = buildQuestionKeywordCandidates(question, questionTokens, contextTokens, 2, allowStandaloneCandidates);
  const sourceCandidates = buildQuestionKeywordCandidates(sourceText, sourceTokens, contextTokens, 1, allowStandaloneCandidates);
  const scoredConcepts = contextConcepts
    .map((concept) => ({
      term: compactKeyword(concept),
      score: scoreConcept(concept, question, questionTokens) * 2 + scoreConcept(concept, sourceText, sourceTokens)
    }))
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.term);

  const generatedCandidates = scoredConcepts.length >= 2
    ? []
    : uniqueKeywords([...questionCandidates, ...sourceCandidates])
      .filter((keyword) => !isRedundantGeneratedKeyword(keyword, scoredConcepts));
  const keywords = uniqueKeywords([...scoredConcepts, ...generatedCandidates])
    .filter(isUsefulRuntimeKeyword)
    .slice(0, 3);
  if (keywords.length) {
    return keywords;
  }

  return [];
}

function scoreConcept(concept: string, question: string, questionTokens: Set<string>) {
  const normalizedConcept = concept.trim().toLowerCase();
  if (!normalizedConcept) {
    return 0;
  }

  const conceptTokens = tokenizeText(normalizedConcept);
  let score = 0;
  for (const token of conceptTokens) {
    if (questionTokens.has(token)) {
      score += token.length >= 5 ? 2 : 1;
    }
  }

  const normalizedQuestion = question.trim().toLowerCase();
  if (normalizedQuestion.includes(normalizedConcept) || normalizedConcept.includes(normalizedQuestion)) {
    score += 4;
  }

  return score;
}

function buildQuestionKeywordCandidates(
  question: string,
  questionTokens: Set<string>,
  contextTokens: Set<string>,
  questionWeight: number,
  allowStandalone = false
) {
  const normalizedQuestion = question
    .replace(/[?!.,;:()"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rawTokens = normalizedQuestion
    .split(" ")
    .filter((token) => {
      const normalizedToken = normalizeToken(token);
      return normalizedToken && questionTokens.has(normalizedToken);
    });
  const candidateMap = new Map<string, number>();

  for (let start = 0; start < rawTokens.length; start += 1) {
    for (let size = 1; size <= 3; size += 1) {
      const phraseTokens = rawTokens.slice(start, start + size);
      if (phraseTokens.length !== size) {
        continue;
      }

      const normalizedTokens = phraseTokens
        .map((token) => normalizeToken(token))
        .filter((token) => token && questionTokens.has(token));
      if (!normalizedTokens.length || normalizedTokens.length !== phraseTokens.length) {
        continue;
      }

      if (!isGoodKeywordPhrase(normalizedTokens)) {
        continue;
      }

      const keyword = compactKeyword(toKeywordLabel(phraseTokens));
      const overlapScore = normalizedTokens.filter((token) => contextTokens.has(token)).length;
      const specificityScore = normalizedTokens.reduce((score, token) => score + (token.length >= 5 ? 1 : 0), 0);
      const acronymScore = phraseTokens.some((token) => /^[A-Z0-9]{2,}$/.test(token)) ? 2 : 0;
      const sizeScore = size === 2 ? 3 : size === 3 ? 2 : 0;
      const professionalSignalScore = normalizedTokens.filter(isProfessionalKeywordToken).length;
      const score = overlapScore * 4 + professionalSignalScore * 2 + specificityScore + acronymScore + sizeScore + questionWeight;

      if (overlapScore === 0 && normalizedTokens.some(isNarrowTechOrDataToken)) {
        continue;
      }

      if (!allowStandalone && overlapScore === 0 && acronymScore === 0) {
        continue;
      }

      if (allowStandalone && overlapScore === 0 && acronymScore === 0 && professionalSignalScore === 0) {
        continue;
      }

      if (normalizedTokens.length === 1 && professionalSignalScore === 0 && specificityScore === 0 && acronymScore === 0) {
        continue;
      }

      if (score >= 3) {
        candidateMap.set(keyword, Math.max(candidateMap.get(keyword) || 0, score));
      }
    }
  }

  return [...candidateMap.entries()]
    .sort((left, right) => right[1] - left[1] || phraseLength(left[0]) - phraseLength(right[0]) || left[0].length - right[0].length)
    .map(([keyword]) => keyword);
}

function isGoodKeywordPhrase(tokens: string[]) {
  if (!tokens.length) {
    return false;
  }

  if (tokens.length === 1) {
    const [token] = tokens;
    if (!token) {
      return false;
    }

    return isProfessionalKeywordToken(token) || token.length >= 7;
  }

  if (tokens.some(isWeakKeywordToken)) {
    return false;
  }

  const meaningfulTokens = tokens.filter((token) => token.length >= 4 || isProfessionalKeywordToken(token));
  return meaningfulTokens.length >= Math.min(2, tokens.length);
}

function isWeakKeywordToken(token: string) {
  const weakTokens = new Set([
    "agar", "akan", "antar", "atau", "bisa", "buat", "cukup", "dapat", "dekat", "dulu", "hampir",
    "harus", "kalau", "lama", "lebih", "mereka", "paling", "para", "salah", "sambil", "sangat",
    "saat", "sedang", "sering", "sudah", "supaya", "tanpa", "tetap", "tidak", "untuk",
    "what", "when", "where", "which", "while", "with", "without", "would"
  ]);
  return weakTokens.has(token);
}

function phraseLength(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isRedundantGeneratedKeyword(keyword: string, anchoredConcepts: string[]) {
  if (!anchoredConcepts.length) {
    return false;
  }

  const keywordTokens = [...tokenizeText(keyword)];
  if (!keywordTokens.length) {
    return true;
  }

  const anchoredTokens = new Set(anchoredConcepts.flatMap((concept) => [...tokenizeText(concept)]));
  const matchedTokens = keywordTokens.filter((token) => anchoredTokens.has(token)).length;
  return matchedTokens / keywordTokens.length >= 0.66;
}

function toKeywordLabel(tokens: string[]) {
  return tokens
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(Ai|Ml|Llm|Api|Sql|Nlp|Cv|Jd|Hr|Ui|Ux|Seo|Crm|Erp|Kpi|Okr|Sla|Qa|Qc)\b/g, (term) => term.toUpperCase());
}

function normalizeToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/gi, "").trim();
}

const generalProfessionalKeywordTokens = new Set([
  "accessibility", "aksesibilitas", "analysis", "analisis", "assessment", "audit", "brand", "budget",
  "biaya", "business", "clinical", "client", "collaboration", "communication", "compliance", "content",
  "konten", "cost", "customer", "decision", "delivery", "demand", "design", "desain", "documentation",
  "dokumen", "education", "evaluasi", "finance", "governance", "growth", "healthcare", "hygiene",
  "higiene", "impact", "dampak", "inventory", "inventori", "jadwal", "kepatuhan", "kebersihan",
  "keselamatan", "kpi", "leadership", "legal", "maintenance", "marketing", "metric", "metrics",
  "negotiation", "negosiasi", "okr", "operation", "operasi", "operasional", "patient", "pelanggan",
  "pelatihan", "pelayanan", "pengadaan", "pengguna", "planning", "policy", "privacy", "process",
  "proses", "procurement", "product", "produk", "quality", "kualitas", "recruitment", "requirement",
  "research", "riset", "responsibility", "risk", "risiko", "safety", "sales", "schedule", "scope",
  "security", "service", "sop", "stakeholder", "standard", "stock", "stok", "strategy", "strategi",
  "supplier", "supply", "support", "teaching", "timeline", "training", "transaction", "transaksi",
  "tradeoff", "validasi", "validation", "workflow"
]);

// These terms are allowed only when anchored by domainProfile/JD/CV overlap.
// They should not act as global keyword magnets for every interview domain.
const narrowTechOrDataTokens = new Set([
  "ai", "algorithm", "algoritma", "api", "data", "etl", "forecast", "forecasting", "llm",
  "machine", "learning", "ml", "model", "models", "nlp", "ocr", "pipeline", "prediksi",
  "query", "rag", "sql"
]);

function hasGeneralProfessionalRelevance(text: string) {
  return [...tokenizeText(text)].some(isProfessionalKeywordToken);
}

function isProfessionalKeywordToken(token: string) {
  return generalProfessionalKeywordTokens.has(token);
}

function isNarrowTechOrDataToken(token: string) {
  return narrowTechOrDataTokens.has(token);
}

function tokenizeText(text: string) {
  const stopwords = new Set([
    "yang", "dan", "atau", "untuk", "dengan", "dari", "pada", "dalam", "kamu", "saya", "apa", "apakah",
    "bagaimana", "kenapa", "mengapa", "bisa", "the", "and", "or", "for", "with", "from", "this", "that",
    "how", "what", "why", "can", "could", "would", "should", "jelaskan", "ceritakan", "menurut", "kalau",
    "jika", "saat", "itu", "ini", "nya", "paling", "cocok", "pilih", "memilih", "gunakan", "pakai",
    "terkait", "tentang", "about", "tell", "me", "please", "use", "using", "choose", "related",
    "nanti", "gue", "aku", "akan", "kasih", "tunjuk", "ya", "dia", "seperti", "kerjaan", "hasil",
    "lihat", "coba", "dong", "deh", "nih", "aja", "sih", "antar", "sedang", "hampir", "tetap", "harus",
    "sudah", "cukup", "supaya", "mereka", "tanpa", "sering", "lama", "dekat", "sebelum", "sesudah",
    "bikin", "buatkan", "membuat", "mencari", "menjaga", "memperbaiki", "bulan", "lalu",
    "role", "domain", "application", "interview", "company", "candidate", "kandidat", "perusahaan",
    "pekerjaan", "kerja"
  ]);

  return new Set(text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token)));
}

function uniqueKeywords(items: string[]) {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const keyword = compactKeyword(item);
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [keyword];
  });
}

function compactKeyword(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 38) {
    return trimmed;
  }

  return `${trimmed.slice(0, 35).trim()}...`;
}

function isUsefulRuntimeKeyword(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length < 3) {
    return false;
  }

  const blocked = new Set([
    "role",
    "posisi",
    "pengalaman",
    "project",
    "proyek",
    "komunikasi",
    "company",
    "interview",
    "ai",
    "data",
    "llm",
    "ml",
    "model",
    "teknologi",
    "technology",
    "bisnis",
    "business",
    "application domain",
    "domain profile belum cukup tajam"
  ]);
  if (blocked.has(normalized)) {
    return false;
  }

  const tokens = [...tokenizeText(normalized)];
  return tokens.length > 0 && tokens.some((token) => token.length >= 4 || isProfessionalKeywordToken(token));
}
