using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

internal static class Program
{
    private const int AudclntStreamFlagsLoopback = 0x00020000;
    private const int AudclntBufferFlagsSilent = 0x00000002;
    private const int ClsctxAll = 23;
    private const double SignalThreshold = 0.015;

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
        IMMDevice device = null;
        IAudioClient audioClient = null;
        IAudioCaptureClient captureClient = null;
        IntPtr formatPtr = IntPtr.Zero;

        try
        {
            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out device));

            Guid audioClientId = typeof(IAudioClient).GUID;
            object audioClientObject;
            Marshal.ThrowExceptionForHR(device.Activate(ref audioClientId, ClsctxAll, IntPtr.Zero, out audioClientObject));
            audioClient = (IAudioClient)audioClientObject;

            Marshal.ThrowExceptionForHR(audioClient.GetMixFormat(out formatPtr));
            AudioFormat format = AudioFormat.FromWaveFormatPointer(formatPtr);

            Guid sessionGuid = Guid.Empty;
            Marshal.ThrowExceptionForHR(audioClient.Initialize(
                AudclntShareMode.Shared,
                AudclntStreamFlagsLoopback,
                10000000,
                0,
                formatPtr,
                ref sessionGuid));

            Guid captureClientId = typeof(IAudioCaptureClient).GUID;
            object captureClientObject;
            Marshal.ThrowExceptionForHR(audioClient.GetService(ref captureClientId, out captureClientObject));
            captureClient = (IAudioCaptureClient)captureClientObject;

            PcmChunkWriter writer = new PcmChunkWriter(Math.Max(10, chunkMs));
            Marshal.ThrowExceptionForHR(audioClient.Start());
            WriteJson("status", "started", 0, "WASAPI loopback stream started");

            while (true)
            {
                DrainStreamPackets(captureClient, format, writer);
                Thread.Sleep(5);
            }
        }
        finally
        {
            if (audioClient != null)
            {
                try { audioClient.Stop(); } catch { }
            }
            if (formatPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(formatPtr);
            ReleaseCom(captureClient);
            ReleaseCom(audioClient);
            ReleaseCom(device);
            ReleaseCom(enumerator);
        }
    }

    private static int RunProbe(int durationMs, int intervalMs)
    {
        IMMDeviceEnumerator enumerator = null;
        IMMDevice device = null;
        IAudioClient audioClient = null;
        IAudioCaptureClient captureClient = null;
        IntPtr formatPtr = IntPtr.Zero;

        try
        {
            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out device));

            Guid audioClientId = typeof(IAudioClient).GUID;
            object audioClientObject;
            Marshal.ThrowExceptionForHR(device.Activate(ref audioClientId, ClsctxAll, IntPtr.Zero, out audioClientObject));
            audioClient = (IAudioClient)audioClientObject;

            Marshal.ThrowExceptionForHR(audioClient.GetMixFormat(out formatPtr));
            AudioFormat format = AudioFormat.FromWaveFormatPointer(formatPtr);

            Guid sessionGuid = Guid.Empty;
            Marshal.ThrowExceptionForHR(audioClient.Initialize(
                AudclntShareMode.Shared,
                AudclntStreamFlagsLoopback,
                10000000,
                0,
                formatPtr,
                ref sessionGuid));

            Guid captureClientId = typeof(IAudioCaptureClient).GUID;
            object captureClientObject;
            Marshal.ThrowExceptionForHR(audioClient.GetService(ref captureClientId, out captureClientObject));
            captureClient = (IAudioCaptureClient)captureClientObject;

            Marshal.ThrowExceptionForHR(audioClient.Start());
            WriteJson("status", "started", 0, "WASAPI loopback probe started");

            Stopwatch stopwatch = Stopwatch.StartNew();
            long nextEmitMs = 0;
            double intervalPeak = 0;
            double overallPeak = 0;

            while (stopwatch.ElapsedMilliseconds < durationMs)
            {
                double packetPeak = DrainPackets(captureClient, format);
                if (packetPeak > intervalPeak) intervalPeak = packetPeak;
                if (packetPeak > overallPeak) overallPeak = packetPeak;

                if (stopwatch.ElapsedMilliseconds >= nextEmitMs)
                {
                    WriteJson("level", "checking", intervalPeak, "System audio probe running");
                    intervalPeak = 0;
                    nextEmitMs = stopwatch.ElapsedMilliseconds + intervalMs;
                }

                Thread.Sleep(10);
            }

            Marshal.ThrowExceptionForHR(audioClient.Stop());

            string status = overallPeak > SignalThreshold ? "ok" : "silent";
            string message = status == "ok"
                ? "System audio signal detected via WASAPI loopback."
                : "WASAPI loopback stream opened, but no system audio signal was detected.";
            WriteJson("result", status, overallPeak, message);
            return 0;
        }
        finally
        {
            if (audioClient != null)
            {
                try { audioClient.Stop(); } catch { }
            }
            if (formatPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(formatPtr);
            ReleaseCom(captureClient);
            ReleaseCom(audioClient);
            ReleaseCom(device);
            ReleaseCom(enumerator);
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

    private static void DrainStreamPackets(IAudioCaptureClient captureClient, AudioFormat format, PcmChunkWriter writer)
    {
        uint packetFrames;
        Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));

        while (packetFrames > 0)
        {
            IntPtr data;
            uint frames;
            uint flags;
            ulong devicePosition;
            ulong qpcPosition;
            Marshal.ThrowExceptionForHR(captureClient.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition));

            WriteResampledPcm(data, frames, flags, format, writer);

            Marshal.ThrowExceptionForHR(captureClient.ReleaseBuffer(frames));
            Marshal.ThrowExceptionForHR(captureClient.GetNextPacketSize(out packetFrames));
        }
    }

    private static void WriteResampledPcm(IntPtr data, uint frames, uint flags, AudioFormat format, PcmChunkWriter writer)
    {
        if (frames == 0 || format.Channels <= 0 || format.BlockAlign <= 0 || format.SamplesPerSec <= 0)
        {
            return;
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
            return;
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
    }

    private static double CalculateRms(IntPtr data, uint frames, AudioFormat format)
    {
        if (frames == 0 || format.Channels <= 0 || format.BlockAlign <= 0) return 0;

        int byteCount = checked((int)(frames * format.BlockAlign));
        byte[] buffer = new byte[byteCount];
        Marshal.Copy(data, buffer, 0, byteCount);

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

    private static string Escape(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
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

    private void Flush()
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
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, IntPtr devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfaceObject);
    int OpenPropertyStore(int access, IntPtr properties);
    int GetId(out IntPtr id);
    int GetState(out uint state);
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
