import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/orviko_dev";
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });

function redactId(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  return `${value.slice(0, 8)}...`;
}

try {
  const [counts] = await sql.unsafe(`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from user_profiles) as user_profiles,
      (select count(*)::int from profile_documents) as profile_documents,
      (select count(*)::int from meeting_contexts) as meeting_contexts,
      (select count(*)::int from live_meeting_sessions) as live_meeting_sessions
  `);

  const profileDocuments = await sql.unsafe(`
    select
      id,
      file_name,
      processing_status,
      is_active,
      length(coalesce(ready_context, ''))::int as ready_context_chars,
      length(coalesce(summary_json::text, ''))::int as summary_json_chars,
      created_at
    from profile_documents
    order by created_at desc
    limit 10
  `);

  const meetingContexts = await sql.unsafe(`
    select
      id,
      context_name,
      meeting_topic,
      status,
      length(coalesce(meeting_brief, ''))::int as brief_chars,
      length(coalesce(meeting_context_text, ''))::int as context_text_chars,
      length(coalesce(meeting_summary_json::text, ''))::int as summary_json_chars,
      created_at
    from meeting_contexts
    order by created_at desc
    limit 10
  `);

  console.log(JSON.stringify({
    database: databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"),
    counts,
    profileDocuments: profileDocuments.map((row) => ({
      ...row,
      id: redactId(row.id)
    })),
    meetingContexts: meetingContexts.map((row) => ({
      ...row,
      id: redactId(row.id)
    }))
  }, null, 2));
} finally {
  await sql.end({ timeout: 1 });
}
