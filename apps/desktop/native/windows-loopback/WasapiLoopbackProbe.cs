using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

internal static class Program
{
    private const int AudclntStreamFlagsLoopback = 0x00020000;
    private const int AudclntBufferFlagsSilent = 0x00000002;
    private const int ClsctxAll = 23;
    private const int DeviceStateActive = 0x00000001;
    private const int StgmRead = 0;
    private const double SignalThreshold = 0.015;
    private const double PeakTieTolerance = 0.003;
    private static readonly PROPERTYKEY PkeyDeviceFriendlyName = new PROPERTYKEY(new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), 14);
    private static readonly PROPERTYKEY PkeyDeviceDescription = new PROPERTYKEY(new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), 2);

    public static int Main(string[] args)
    {
        if (args.Length == 0 || (args[0] != "probe" && args[0] != "stream"))
        {
            WriteJson("error", "invalid_command", 0, "Usage: WasapiLoopbackProbe.exe probe [--milliseconds 3000] [--interval 120] | stream [--chunk-ms 40]");
            return 1;
        }

        int durationMs = ReadIntArg(args, "--milliseconds", 3000);
        int intervalMs = ReadIntArg(args, "--interval", 120);
        int chunkMs = ReadIntArg(args, "--chunk-ms", 40);

        try
        {
            return args[0] == "stream" ? RunStream(chunkMs) : RunProbe(durationMs, intervalMs);
        }
        catch (Exception error)
        {
            WriteJson("error", "error", 0, error.Message);
            return 2;
        }
    }

    private static int RunStream(int chunkMs)
    {
        IMMDeviceEnumerator enumerator = null;
        AudioCaptureSession currentSession = null;
        PcmChunkWriter writer = null;

        try
        {
            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            WriteJson("status", "waiting_for_audio", 0, "Looking for active system audio output");

            Stopwatch stopwatch = Stopwatch.StartNew();
            long nextLevelEmitMs = 0;
            long nextWaitingEmitMs = 0;
            long lastSignalMs = 0;

            while (true)
            {
                if (currentSession == null)
                {
                    if (stopwatch.ElapsedMilliseconds >= nextWaitingEmitMs)
                    {
                        WriteJson("status", "waiting_for_audio", 0, "Looking for active system audio output");
                        nextWaitingEmitMs = stopwatch.ElapsedMilliseconds + 1000;
                    }

                    currentSession = SelectActiveRenderSession(enumerator, 800, 80, false);
                    if (currentSession == null)
                    {
                        Thread.Sleep(200);
                        continue;
                    }

                    writer = new PcmChunkWriter(Math.Max(10, chunkMs));
                    lastSignalMs = stopwatch.ElapsedMilliseconds;
                    nextLevelEmitMs = 0;
                    WriteDeviceJson("selected_device", "ok", currentSession.Device, currentSession.LastPeak, "Selected active system audio output.");
                }

                double packetPeak = currentSession.DrainStream(writer);
                if (packetPeak > SignalThreshold)
                {
                    lastSignalMs = stopwatch.ElapsedMilliseconds;
                }

                if (stopwatch.ElapsedMilliseconds >= nextLevelEmitMs)
                {
                    string status = packetPeak > SignalThreshold ? "ok" : "silent";
                    WriteDeviceJson("level", status, currentSession.Device, packetPeak, "System audio stream running.");
                    nextLevelEmitMs = stopwatch.ElapsedMilliseconds + 500;
                }

                if (stopwatch.ElapsedMilliseconds - lastSignalMs > 3000)
                {
                    writer.Flush();
                    currentSession.Dispose();
                    currentSession = null;
                    writer = null;
                    WriteJson("status", "waiting_for_audio", 0, "System audio became silent. Rescanning active outputs.");
                }

                Thread.Sleep(5);
            }
        }
        finally
        {
            if (writer != null) writer.Flush();
            if (currentSession != null) currentSession.Dispose();
            ReleaseCom(enumerator);
        }
    }

    private static int RunProbe(int durationMs, int intervalMs)
    {
        IMMDeviceEnumerator enumerator = null;
        List<AudioCaptureSession> sessions = null;

        try
        {
            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            sessions = StartActiveRenderSessions(enumerator);
            if (sessions.Count == 0)
            {
                WriteJson("status", "waiting_for_audio", 0, "No active system audio outputs are available.");
                WriteJson("result", "silent", 0, "No active system audio output was detected.");
                return 0;
            }

            WriteJson("status", "started", 0, "WASAPI loopback probe started for active system outputs.");

            Stopwatch stopwatch = Stopwatch.StartNew();
            long nextEmitMs = 0;

            while (stopwatch.ElapsedMilliseconds < durationMs)
            {
                for (int index = 0; index < sessions.Count; index++)
                {
                    sessions[index].DrainPeak();
                }

                if (stopwatch.ElapsedMilliseconds >= nextEmitMs)
                {
                    AudioCaptureSession bestInterval = SelectBestSession(sessions, false);
                    if (bestInterval != null)
                    {
                        string levelStatus = bestInterval.LastPeak > SignalThreshold ? "ok" : "checking";
                        WriteDeviceJson("level", levelStatus, bestInterval.Device, bestInterval.LastPeak, "System audio probe running.");
                    }
                    else
                    {
                        WriteJson("level", "checking", 0, "System audio probe running.");
                    }

                    nextEmitMs = stopwatch.ElapsedMilliseconds + intervalMs;
                }

                Thread.Sleep(10);
            }

            AudioCaptureSession bestOverall = SelectBestSession(sessions, true);
            if (bestOverall != null && bestOverall.OverallPeak > SignalThreshold)
            {
                WriteDeviceJson("selected_device", "ok", bestOverall.Device, bestOverall.OverallPeak, "Selected active system audio output.");
                WriteDeviceJson("result", "ok", bestOverall.Device, bestOverall.OverallPeak, "System audio signal detected via WASAPI loopback.");
            }
            else
            {
                WriteJson("status", "waiting_for_audio", 0, "Looking for active system audio output");
                WriteJson("result", "silent", 0, "WASAPI loopback opened active outputs, but no system audio signal was detected.");
            }

            return 0;
        }
        finally
        {
            if (sessions != null)
            {
                DisposeSessions(sessions);
            }
            ReleaseCom(enumerator);
        }
    }

    private static AudioCaptureSession SelectActiveRenderSession(IMMDeviceEnumerator enumerator, int scanMs, int intervalMs, bool emitLevels)
    {
        List<AudioCaptureSession> sessions = StartActiveRenderSessions(enumerator);
        if (sessions.Count == 0)
        {
            return null;
        }

        try
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            long nextEmitMs = 0;
            while (stopwatch.ElapsedMilliseconds < scanMs)
            {
                for (int index = 0; index < sessions.Count; index++)
                {
                    sessions[index].DrainPeak();
                }

                if (emitLevels && stopwatch.ElapsedMilliseconds >= nextEmitMs)
                {
                    AudioCaptureSession intervalBest = SelectBestSession(sessions, false);
                    if (intervalBest != null)
                    {
                        WriteDeviceJson("level", "checking", intervalBest.Device, intervalBest.LastPeak, "Scanning active system audio outputs.");
                    }
                    nextEmitMs = stopwatch.ElapsedMilliseconds + intervalMs;
                }

                Thread.Sleep(10);
            }

            AudioCaptureSession best = SelectBestSession(sessions, true);
            if (best == null || best.OverallPeak <= SignalThreshold)
            {
                DisposeSessions(sessions);
                return null;
            }

            for (int index = sessions.Count - 1; index >= 0; index--)
            {
                if (!object.ReferenceEquals(sessions[index], best))
                {
                    sessions[index].Dispose();
                    sessions.RemoveAt(index);
                }
            }

            return best;
        }
        catch
        {
            DisposeSessions(sessions);
            throw;
        }
    }

    private static List<AudioCaptureSession> StartActiveRenderSessions(IMMDeviceEnumerator enumerator)
    {
        List<RenderDeviceInfo> devices = EnumerateActiveRenderDevices(enumerator);
        List<AudioCaptureSession> sessions = new List<AudioCaptureSession>();

        for (int index = 0; index < devices.Count; index++)
        {
            RenderDeviceInfo device = devices[index];
            try
            {
                sessions.Add(AudioCaptureSession.Start(device));
            }
            catch
            {
                ReleaseCom(device.Device);
            }
        }

        return sessions;
    }

    private static List<RenderDeviceInfo> EnumerateActiveRenderDevices(IMMDeviceEnumerator enumerator)
    {
        IMMDeviceCollection collection = null;
        List<RenderDeviceInfo> devices = new List<RenderDeviceInfo>();
        Dictionary<string, int> defaultRanks = ReadDefaultRenderRanks(enumerator);

        try
        {
            Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(EDataFlow.eRender, DeviceStateActive, out collection));
            uint count;
            Marshal.ThrowExceptionForHR(collection.GetCount(out count));

            for (uint index = 0; index < count; index++)
            {
                IMMDevice device;
                Marshal.ThrowExceptionForHR(collection.Item(index, out device));
                string id = ReadDeviceId(device);
                int rank = defaultRanks.ContainsKey(id) ? defaultRanks[id] : 100;
                devices.Add(new RenderDeviceInfo(device, id, ReadDeviceLabel(device), rank));
            }
        }
        finally
        {
            ReleaseCom(collection);
        }

        return devices;
    }

    private static Dictionary<string, int> ReadDefaultRenderRanks(IMMDeviceEnumerator enumerator)
    {
        Dictionary<string, int> ranks = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        ERole[] roles = new ERole[] { ERole.eConsole, ERole.eMultimedia, ERole.eCommunications };

        for (int index = 0; index < roles.Length; index++)
        {
            IMMDevice defaultDevice = null;
            try
            {
                Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, roles[index], out defaultDevice));
                string id = ReadDeviceId(defaultDevice);
                if (!ranks.ContainsKey(id) || ranks[id] > index)
                {
                    ranks[id] = index;
                }
            }
            catch
            {
            }
            finally
            {
                ReleaseCom(defaultDevice);
            }
        }

        return ranks;
    }

    private static AudioCaptureSession SelectBestSession(List<AudioCaptureSession> sessions, bool useOverallPeak)
    {
        AudioCaptureSession best = null;
        double bestPeak = -1;

        for (int index = 0; index < sessions.Count; index++)
        {
            AudioCaptureSession session = sessions[index];
            double peak = useOverallPeak ? session.OverallPeak : session.LastPeak;
            if (best == null || IsBetterDeviceCandidate(session, peak, best, bestPeak))
            {
                best = session;
                bestPeak = peak;
            }
        }

        return best;
    }

    private static bool IsBetterDeviceCandidate(AudioCaptureSession candidate, double candidatePeak, AudioCaptureSession current, double currentPeak)
    {
        if (candidatePeak > currentPeak + PeakTieTolerance)
        {
            return true;
        }

        if (Math.Abs(candidatePeak - currentPeak) <= PeakTieTolerance)
        {
            return candidate.Device.DefaultRank < current.Device.DefaultRank;
        }

        return false;
    }

    private static void DisposeSessions(List<AudioCaptureSession> sessions)
    {
        for (int index = 0; index < sessions.Count; index++)
        {
            sessions[index].Dispose();
        }
        sessions.Clear();
    }

    private static string ReadDeviceId(IMMDevice device)
    {
        IntPtr idPtr = IntPtr.Zero;
        try
        {
            Marshal.ThrowExceptionForHR(device.GetId(out idPtr));
            return Marshal.PtrToStringUni(idPtr) ?? "";
        }
        finally
        {
            if (idPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(idPtr);
        }
    }

    private static string ReadDeviceLabel(IMMDevice device)
    {
        IPropertyStore store = null;
        try
        {
            Marshal.ThrowExceptionForHR(device.OpenPropertyStore(StgmRead, out store));
            string friendlyName = ReadPropertyStoreString(store, PkeyDeviceFriendlyName);
            if (!string.IsNullOrWhiteSpace(friendlyName))
            {
                return friendlyName;
            }

            string description = ReadPropertyStoreString(store, PkeyDeviceDescription);
            return string.IsNullOrWhiteSpace(description) ? "System output" : description;
        }
        catch
        {
            return "System output";
        }
        finally
        {
            ReleaseCom(store);
        }
    }

    private static string ReadPropertyStoreString(IPropertyStore store, PROPERTYKEY key)
    {
        PROPVARIANT value = new PROPVARIANT();
        try
        {
            Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
            return value.GetString();
        }
        catch
        {
            return "";
        }
        finally
        {
            PropVariantClear(ref value);
        }
    }

    private static double DrainPackets(IAudioCaptureClient captureClient, AudioFormat format)
    {
        uint packetFrames;
        Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));

        double peak = 0;
        while (packetFrames > 0)
        {
            IntPtr data;
            uint frames;
            uint flags;
            ulong devicePosition;
            ulong qpcPosition;
            Marshal.ThrowExceptionForHR(captureClient.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition));

            double rms = (flags & AudclntBufferFlagsSilent) == AudclntBufferFlagsSilent
                ? 0
                : CalculateRms(data, frames, format);
            if (rms > peak) peak = rms;

            Marshal.ThrowExceptionForHR(captureClient.ReleaseBuffer(frames));
            Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));
        }

        return peak;
    }

    private static double DrainStreamPackets(IAudioCaptureClient captureClient, AudioFormat format, PcmChunkWriter writer)
    {
        uint packetFrames;
        Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));

        double peak = 0;
        while (packetFrames > 0)
        {
            IntPtr data;
            uint frames;
            uint flags;
            ulong devicePosition;
            ulong qpcPosition;
            Marshal.ThrowExceptionForHR(captureClient.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition));

            double rms = WriteResampledPcm(data, frames, flags, format, writer);
            if (rms > peak) peak = rms;

            Marshal.ThrowExceptionForHR(captureClient.ReleaseBuffer(frames));
            Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));
        }

        return peak;
    }

    private static double WriteResampledPcm(IntPtr data, uint frames, uint flags, AudioFormat format, PcmChunkWriter writer)
    {
        if (frames == 0 || format.Channels <= 0 || format.BlockAlign <= 0 || format.SamplesPerSec <= 0)
        {
            return 0;
        }

        int sourceFrameCount = checked((int)frames);
        int targetFrames = Math.Max(1, (int)Math.Round(sourceFrameCount * 24000.0 / format.SamplesPerSec));
        bool silent = (flags & AudclntBufferFlagsSilent) == AudclntBufferFlagsSilent;

        if (silent)
        {
            for (int index = 0; index < targetFrames; index++)
            {
                writer.WriteSample(0);
            }
            return 0;
        }

        int byteCount = checked((int)(frames * format.BlockAlign));
        byte[] buffer = new byte[byteCount];
        Marshal.Copy(data, buffer, 0, byteCount);

        double sourceFramesPerTargetFrame = format.SamplesPerSec / 24000.0;
        for (int targetFrame = 0; targetFrame < targetFrames; targetFrame++)
        {
            int sourceFrame = (int)Math.Floor(targetFrame * sourceFramesPerTargetFrame);
            if (sourceFrame >= sourceFrameCount)
            {
                sourceFrame = sourceFrameCount - 1;
            }

            double sample = ReadMonoSample(buffer, sourceFrame, format);
            writer.WriteSample(ToPcm16(sample));
        }

        return CalculateRms(buffer, sourceFrameCount, format);
    }

    private static double CalculateRms(IntPtr data, uint frames, AudioFormat format)
    {
        if (frames == 0 || format.Channels <= 0 || format.BlockAlign <= 0) return 0;

        int byteCount = checked((int)(frames * format.BlockAlign));
        byte[] buffer = new byte[byteCount];
        Marshal.Copy(data, buffer, 0, byteCount);

        return CalculateRms(buffer, checked((int)frames), format);
    }

    private static double CalculateRms(byte[] buffer, int frames, AudioFormat format)
    {
        if (frames == 0 || format.Channels <= 0 || format.BlockAlign <= 0) return 0;

        double total = 0;
        int samples = 0;
        int bytesPerSample = Math.Max(1, format.BitsPerSample / 8);

        for (int frame = 0; frame < frames; frame++)
        {
            int frameOffset = frame * format.BlockAlign;
            for (int channel = 0; channel < format.Channels; channel++)
            {
                int offset = frameOffset + channel * bytesPerSample;
                if (offset + bytesPerSample > buffer.Length) continue;

                double sample = ReadSample(buffer, offset, bytesPerSample, format);
                total += sample * sample;
                samples++;
            }
        }

        return samples == 0 ? 0 : Math.Sqrt(total / samples);
    }

    private static double ReadSample(byte[] buffer, int offset, int bytesPerSample, AudioFormat format)
    {
        if (format.IsFloat && bytesPerSample == 4)
        {
            return Math.Max(-1, Math.Min(1, BitConverter.ToSingle(buffer, offset)));
        }

        if (bytesPerSample == 2)
        {
            return BitConverter.ToInt16(buffer, offset) / 32768.0;
        }

        if (bytesPerSample == 3)
        {
            int value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
            if ((value & 0x800000) != 0) value |= unchecked((int)0xff000000);
            return value / 8388608.0;
        }

        if (bytesPerSample == 4)
        {
            return BitConverter.ToInt32(buffer, offset) / 2147483648.0;
        }

        return 0;
    }

    private static double ReadMonoSample(byte[] buffer, int frame, AudioFormat format)
    {
        int bytesPerSample = Math.Max(1, format.BitsPerSample / 8);
        int frameOffset = frame * format.BlockAlign;
        double total = 0;
        int samples = 0;

        for (int channel = 0; channel < format.Channels; channel++)
        {
            int offset = frameOffset + channel * bytesPerSample;
            if (offset + bytesPerSample > buffer.Length) continue;

            total += ReadSample(buffer, offset, bytesPerSample, format);
            samples++;
        }

        return samples == 0 ? 0 : total / samples;
    }

    private static short ToPcm16(double sample)
    {
        double clamped = Math.Max(-1, Math.Min(1, sample));
        return (short)Math.Round(clamped * 32767);
    }

    private static int ReadIntArg(string[] args, string name, int fallback)
    {
        for (int index = 0; index < args.Length - 1; index++)
        {
            if (args[index] == name)
            {
                int value;
                return int.TryParse(args[index + 1], out value) ? value : fallback;
            }
        }
        return fallback;
    }

    private static void ReleaseCom(object value)
    {
        if (value != null && Marshal.IsComObject(value))
        {
            Marshal.ReleaseComObject(value);
        }
    }

    [DllImport("Ole32.dll")]
    private static extern int PropVariantClear(ref PROPVARIANT pvar);

    private static void WriteJson(string type, string status, double level, string message)
    {
        string normalizedLevel = Math.Max(0, Math.Min(1, level * 8)).ToString("0.####", CultureInfo.InvariantCulture);
        string peak = Math.Max(0, level).ToString("0.####", CultureInfo.InvariantCulture);
        Console.WriteLine(
            "{\"type\":\"" + Escape(type) +
            "\",\"status\":\"" + Escape(status) +
            "\",\"level\":" + normalizedLevel +
            ",\"peak\":" + peak +
            ",\"message\":\"" + Escape(message) + "\"}");
        Console.Out.Flush();
    }

    private static void WriteDeviceJson(string type, string status, RenderDeviceInfo device, double level, string message)
    {
        string normalizedLevel = Math.Max(0, Math.Min(1, level * 8)).ToString("0.####", CultureInfo.InvariantCulture);
        string peak = Math.Max(0, level).ToString("0.####", CultureInfo.InvariantCulture);
        Console.WriteLine(
            "{\"type\":\"" + Escape(type) +
            "\",\"status\":\"" + Escape(status) +
            "\",\"deviceId\":\"" + Escape(device == null ? "" : device.Id) +
            "\",\"deviceLabel\":\"" + Escape(device == null ? "System output" : device.Label) +
            "\",\"level\":" + normalizedLevel +
            ",\"peak\":" + peak +
            ",\"message\":\"" + Escape(message) + "\"}");
        Console.Out.Flush();
    }

    private static string Escape(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    private sealed class RenderDeviceInfo
    {
        public readonly IMMDevice Device;
        public readonly string Id;
        public readonly string Label;
        public readonly int DefaultRank;

        public RenderDeviceInfo(IMMDevice device, string id, string label, int defaultRank)
        {
            Device = device;
            Id = id ?? "";
            Label = string.IsNullOrWhiteSpace(label) ? "System output" : label;
            DefaultRank = defaultRank;
        }
    }

    private sealed class AudioCaptureSession : IDisposable
    {
        public readonly RenderDeviceInfo Device;
        public double LastPeak;
        public double OverallPeak;

        private IAudioClient _audioClient;
        private IAudioCaptureClient _captureClient;
        private IntPtr _formatPtr;
        private AudioFormat _format;

        private AudioCaptureSession(RenderDeviceInfo device)
        {
            Device = device;
        }

        public static AudioCaptureSession Start(RenderDeviceInfo device)
        {
            AudioCaptureSession session = new AudioCaptureSession(device);
            try
            {
                Guid audioClientId = typeof(IAudioClient).GUID;
                object audioClientObject;
                Marshal.ThrowExceptionForHR(device.Device.Activate(ref audioClientId, ClsctxAll, IntPtr.Zero, out audioClientObject));
                session._audioClient = (IAudioClient)audioClientObject;

                Marshal.ThrowExceptionForHR(session._audioClient.GetMixFormat(out session._formatPtr));
                session._format = AudioFormat.FromWaveFormatPointer(session._formatPtr);

                Guid sessionGuid = Guid.Empty;
                Marshal.ThrowExceptionForHR(session._audioClient.Initialize(
                    AudclntShareMode.Shared,
                    AudclntStreamFlagsLoopback,
                    10000000,
                    0,
                    session._formatPtr,
                    ref sessionGuid));

                Guid captureClientId = typeof(IAudioCaptureClient).GUID;
                object captureClientObject;
                Marshal.ThrowExceptionForHR(session._audioClient.GetService(ref captureClientId, out captureClientObject));
                session._captureClient = (IAudioCaptureClient)captureClientObject;

                Marshal.ThrowExceptionForHR(session._audioClient.Start());
                return session;
            }
            catch
            {
                session.Dispose(false);
                throw;
            }
        }

        public double DrainPeak()
        {
            LastPeak = DrainPackets(_captureClient, _format);
            if (LastPeak > OverallPeak) OverallPeak = LastPeak;
            return LastPeak;
        }

        public double DrainStream(PcmChunkWriter writer)
        {
            LastPeak = DrainStreamPackets(_captureClient, _format, writer);
            if (LastPeak > OverallPeak) OverallPeak = LastPeak;
            return LastPeak;
        }

        public void Dispose()
        {
            Dispose(true);
        }

        private void Dispose(bool releaseDevice)
        {
            if (_audioClient != null)
            {
                try { _audioClient.Stop(); } catch { }
            }
            if (_formatPtr != IntPtr.Zero)
            {
                Marshal.FreeCoTaskMem(_formatPtr);
                _formatPtr = IntPtr.Zero;
            }
            ReleaseCom(_captureClient);
            ReleaseCom(_audioClient);
            _captureClient = null;
            _audioClient = null;

            if (releaseDevice && Device != null)
            {
                ReleaseCom(Device.Device);
            }
        }
    }
}

internal sealed class PcmChunkWriter
{
    private const int TargetSampleRate = 24000;
    private readonly byte[] _buffer;
    private int _offset;

    public PcmChunkWriter(int chunkMs)
    {
        int samplesPerChunk = Math.Max(1, TargetSampleRate * chunkMs / 1000);
        _buffer = new byte[samplesPerChunk * 2];
        _offset = 0;
    }

    public void WriteSample(short sample)
    {
        _buffer[_offset] = (byte)(sample & 0xff);
        _buffer[_offset + 1] = (byte)((sample >> 8) & 0xff);
        _offset += 2;

        if (_offset >= _buffer.Length)
        {
            Flush();
        }
    }

    public void Flush()
    {
        if (_offset == 0)
        {
            return;
        }

        byte[] chunk = _buffer;
        if (_offset != _buffer.Length)
        {
            chunk = new byte[_offset];
            Buffer.BlockCopy(_buffer, 0, chunk, 0, _offset);
        }

        Console.WriteLine(
            "{\"type\":\"audio_chunk\",\"sampleRate\":24000,\"format\":\"pcm16\",\"audio\":\"" +
            Convert.ToBase64String(chunk) +
            "\"}");
        Console.Out.Flush();
        _offset = 0;
    }
}

internal sealed class AudioFormat
{
    public short Channels;
    public int SamplesPerSec;
    public short BitsPerSample;
    public short BlockAlign;
    public bool IsFloat;

    public static AudioFormat FromWaveFormatPointer(IntPtr pointer)
    {
        short formatTag = Marshal.ReadInt16(pointer, 0);
        short channels = Marshal.ReadInt16(pointer, 2);
        int samplesPerSec = Marshal.ReadInt32(pointer, 4);
        short blockAlign = Marshal.ReadInt16(pointer, 12);
        short bitsPerSample = Marshal.ReadInt16(pointer, 14);

        int subFormatData1 = formatTag == unchecked((short)0xfffe) ? Marshal.ReadInt32(pointer, 24) : formatTag;

        return new AudioFormat
        {
            Channels = channels,
            SamplesPerSec = samplesPerSec,
            BitsPerSample = bitsPerSample,
            BlockAlign = blockAlign,
            IsFloat = subFormatData1 == 3
        };
    }
}

internal enum EDataFlow
{
    eRender = 0,
    eCapture = 1,
    eAll = 2
}

internal enum ERole
{
    eConsole = 0,
    eMultimedia = 1,
    eCommunications = 2
}

internal enum AudclntShareMode
{
    Shared = 0,
    Exclusive = 1
}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumerator
{
}

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator
{
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
}

[ComImport]
[Guid("0BD7A1BE-7A1A-44DB-8397-C0C7B3710F5C")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceCollection
{
    int GetCount(out uint count);
    int Item(uint index, out IMMDevice device);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfaceObject);
    int OpenPropertyStore(int access, out IPropertyStore properties);
    int GetId(out IntPtr id);
    int GetState(out uint state);
}

[ComImport]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyStore
{
    int GetCount(out uint propertyCount);
    int GetAt(uint propertyIndex, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
    int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);
    int Commit();
}

[StructLayout(LayoutKind.Sequential)]
internal struct PROPERTYKEY
{
    public Guid fmtid;
    public uint pid;

    public PROPERTYKEY(Guid formatId, uint propertyId)
    {
        fmtid = formatId;
        pid = propertyId;
    }
}

[StructLayout(LayoutKind.Sequential)]
internal struct PROPVARIANT
{
    public ushort vt;
    public ushort wReserved1;
    public ushort wReserved2;
    public ushort wReserved3;
    public IntPtr p;
    public int p2;

    public string GetString()
    {
        if (vt == 31 && p != IntPtr.Zero)
        {
            return Marshal.PtrToStringUni(p) ?? "";
        }

        if (vt == 30 && p != IntPtr.Zero)
        {
            return Marshal.PtrToStringAnsi(p) ?? "";
        }

        return "";
    }
}

[ComImport]
[Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioClient
{
    int Initialize(AudclntShareMode shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, ref Guid audioSessionGuid);
    int GetBufferSize(out uint bufferFrameCount);
    int GetStreamLatency(out long latency);
    int GetCurrentPadding(out uint currentPadding);
    int IsFormatSupported(AudclntShareMode shareMode, IntPtr format, out IntPtr closestMatch);
    int GetMixFormat(out IntPtr deviceFormat);
    int GetDevicePeriod(out long defaultDevicePeriod, out long minimumDevicePeriod);
    int Start();
    int Stop();
    int Reset();
    int SetEventHandle(IntPtr eventHandle);
    int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
}

[ComImport]
[Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioCaptureClient
{
    int GetBuffer(out IntPtr data, out uint framesToRead, out uint flags, out ulong devicePosition, out ulong qpcPosition);
    int ReleaseBuffer(uint framesRead);
    int GetNextPacketSize(out uint nextPacketSize);
}
