import wave
import struct

# Parameters for the WAV file
duration = 1.0  # seconds
sample_rate = 48000  # Hz
num_channels = 4  # Mono
sample_width = 2  # 2 bytes (16 bits) per sample

# Calculate number of frames
num_frames = int(duration * sample_rate)

# Create silent audio data (all zeros)
silence_data = struct.pack('<' + 'h' * num_frames, *([0] * num_frames))

# Create the WAV file
with wave.open('silent.wav', 'w') as wav_file:
    wav_file.setnchannels(num_channels)
    wav_file.setsampwidth(sample_width)
    wav_file.setframerate(sample_rate)
    wav_file.writeframes(silence_data)

print("Silent WAV file created: silent.wav")
