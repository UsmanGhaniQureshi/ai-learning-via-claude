"""Speech Engine — Speech-to-text using Vosk + NLP analysis for confidence."""
import json
import os
import wave
import numpy as np
from vosk import Model, KaldiRecognizer
import re
from collections import deque
import time
from audio_analyzer import AudioAnalyzer

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'vosk-model')

# Filler words list
FILLERS = {
    'um', 'uh', 'uhh', 'ah', 'er', 'hmm', 'umm', 'ahh',
    'like',  # often filler, accept 85% accuracy
    'basically', 'actually', 'literally', 'honestly',
}

FILLER_PHRASES = [
    'you know', 'i mean', 'sort of', 'kind of', 'okay so',
]

HEDGING_PHRASES = [
    'i think', 'i believe', 'i feel like', 'i guess',
    'maybe', 'probably', 'perhaps',
    'sort of', 'kind of', 'a little bit',
    "i'm not sure", 'i could be wrong', 'correct me if',
    'if i\'m not mistaken',
    'sorry but', 'sorry',
]


class SpeechEngine:
    """Handles speech-to-text and text analysis for confidence signals."""

    def __init__(self):
        self.model = Model(MODEL_PATH)
        self.recognizer = None
        self.sample_rate = 16000

        # Transcript accumulator
        self.full_transcript = []
        self.word_timestamps = []

        # Metrics
        self.total_words = 0
        self.filler_count = 0
        self.hedge_count = 0
        self.repetition_count = 0
        self.filler_words_found = []
        self.hedge_phrases_found = []

        # Timing
        self.start_time = None
        self.last_words = deque(maxlen=5)

    def start(self):
        """Initialize recognizer for a new session."""
        self.recognizer = KaldiRecognizer(self.model, self.sample_rate)
        self.recognizer.SetWords(True)
        self.reset()
        self.start_time = time.time()

    def process_audio_chunk(self, audio_data):
        """Process a chunk of raw audio (16-bit PCM, 16kHz, mono).
        Returns dict with transcript and analysis if new text is available."""
        if self.recognizer is None:
            return None

        try:
            if self.recognizer.AcceptWaveform(audio_data):
                result = json.loads(self.recognizer.Result())
                text = result.get('text', '').strip()
                if text:
                    return self._analyze_text(text, is_final=True)
            else:
                partial = json.loads(self.recognizer.PartialResult())
                text = partial.get('partial', '').strip()
                if text:
                    return {'type': 'interim', 'text': text}
        except Exception:
            pass

        return None

    def process_audio_file(self, filepath):
        """Process an entire audio file. Returns full analysis."""
        wf = wave.open(filepath, 'rb')
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
            return [{'error': 'Audio must be mono 16-bit PCM WAV'}]

        rate = wf.getframerate()
        rec = KaldiRecognizer(self.model, rate)
        rec.SetWords(True)

        self.reset()
        # FIX: Track elapsed time from audio frames, not wall clock
        self._file_mode = True
        self._file_sample_rate = rate
        self._file_samples_read = 0
        self.start_time = time.time()  # Still needed for get_summary

        # Audio analyzer for volume/pitch/silence
        audio_analyzer = AudioAnalyzer(sample_rate=rate)
        audio_analyzer.start()

        results = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break

            self._file_samples_read += 4000

            # Analyze audio chunk for volume/pitch
            try:
                audio_result = audio_analyzer.analyze_chunk(data, sample_rate=rate)
            except Exception:
                audio_result = None

            if rec.AcceptWaveform(data):
                r = json.loads(rec.Result())
                text = r.get('text', '').strip()
                if text:
                    analysis = self._analyze_text(text, is_final=True)
                    if analysis:
                        if audio_result:
                            analysis['voice_steadiness'] = audio_result.get('voice_steadiness')
                            analysis['pitch_hz'] = audio_result.get('pitch_hz')
                            analysis['rms'] = audio_result.get('rms')
                        results.append(analysis)

        # Final result
        final = json.loads(rec.FinalResult())
        text = final.get('text', '').strip()
        if text:
            analysis = self._analyze_text(text, is_final=True)
            if analysis:
                results.append(analysis)

        wf.close()

        # Attach audio summary
        self._audio_summary = audio_analyzer.get_summary()
        self._file_mode = False

        return results

    def _analyze_text(self, text, is_final=False):
        """Analyze a chunk of final text for confidence signals."""
        if not is_final:
            return {'type': 'interim', 'text': text}

        text_lower = text.lower()
        words = text_lower.split()

        self.full_transcript.append(text)
        self.total_words += len(words)

        # Filler detection
        fillers_in_chunk = []
        for w in words:
            if w in FILLERS:
                self.filler_count += 1
                fillers_in_chunk.append(w)
                self.filler_words_found.append(w)

        # Filler phrase detection
        for phrase in FILLER_PHRASES:
            count = text_lower.count(phrase)
            if count > 0:
                self.filler_count += count
                fillers_in_chunk.extend([phrase] * count)
                self.filler_words_found.extend([phrase] * count)

        # Hedging detection
        hedges_in_chunk = []
        for phrase in HEDGING_PHRASES:
            count = text_lower.count(phrase)
            if count > 0:
                self.hedge_count += count
                hedges_in_chunk.extend([phrase] * count)
                self.hedge_phrases_found.extend([phrase] * count)

        # Repetition detection (consecutive duplicate words)
        reps_in_chunk = 0
        for i in range(1, len(words)):
            if words[i] == words[i-1] and words[i] not in FILLERS:
                self.repetition_count += 1
                reps_in_chunk += 1

        # Pace calculation
        # FIX: Use audio-based elapsed time in file mode to avoid epoch time bug
        if getattr(self, '_file_mode', False) and self._file_sample_rate > 0:
            elapsed = self._file_samples_read / self._file_sample_rate
        else:
            elapsed = time.time() - self.start_time if self.start_time else 1
        if elapsed < 1:
            elapsed = 1
        wpm = int((self.total_words / elapsed) * 60)

        # Pace assessment
        if wpm < 100:
            pace_label = 'too_slow'
        elif wpm < 130:
            pace_label = 'slightly_slow'
        elif wpm <= 160:
            pace_label = 'optimal'
        elif wpm <= 180:
            pace_label = 'slightly_fast'
        else:
            pace_label = 'too_fast'

        # Filler rate
        filler_rate = (self.filler_count / self.total_words * 100) if self.total_words > 0 else 0

        # Speech confidence score (0-100, higher = more confident)
        filler_penalty = min(40, filler_rate * 5)
        hedge_penalty = min(30, self.hedge_count * 3)
        rep_penalty = min(15, self.repetition_count * 5)
        pace_penalty = 0
        if pace_label == 'too_fast':
            pace_penalty = 15
        elif pace_label == 'too_slow':
            pace_penalty = 10
        elif pace_label in ('slightly_fast', 'slightly_slow'):
            pace_penalty = 5

        speech_score = max(0, 100 - int(filler_penalty + hedge_penalty + rep_penalty + pace_penalty))

        return {
            'type': 'final',
            'text': text,
            'timestamp': round(elapsed, 1),
            'fillers_in_chunk': fillers_in_chunk,
            'hedges_in_chunk': hedges_in_chunk,
            'repetitions_in_chunk': reps_in_chunk,
            'total_words': self.total_words,
            'total_fillers': self.filler_count,
            'total_hedges': self.hedge_count,
            'total_repetitions': self.repetition_count,
            'filler_rate': round(filler_rate, 1),
            'wpm': wpm,
            'pace': pace_label,
            'speech_score': speech_score,
        }

    def get_summary(self):
        """Get session summary."""
        elapsed = time.time() - self.start_time if self.start_time else 0
        wpm = int((self.total_words / elapsed) * 60) if elapsed > 0 else 0
        filler_rate = (self.filler_count / self.total_words * 100) if self.total_words > 0 else 0

        # Include audio analysis if available
        audio_summary = getattr(self, '_audio_summary', None)

        summary = {
            'full_transcript': ' '.join(self.full_transcript),
            'duration': round(elapsed, 1),
            'total_words': self.total_words,
            'total_fillers': self.filler_count,
            'total_hedges': self.hedge_count,
            'total_repetitions': self.repetition_count,
            'filler_rate': round(filler_rate, 1),
            'average_wpm': wpm,
            'filler_words': self.filler_words_found,
            'hedge_phrases': self.hedge_phrases_found,
        }

        if audio_summary:
            summary['voice_steadiness'] = audio_summary.get('voice_steadiness', 50)
            summary['volume_consistency'] = audio_summary.get('volume_consistency', 50)
            summary['pitch_score'] = audio_summary.get('pitch_score', 50)
            summary['silence_gaps'] = audio_summary.get('silence_gaps', [])
            summary['silence_gap_count'] = audio_summary.get('silence_gap_count', 0)

        return summary

    def reset(self):
        self.full_transcript = []
        self.word_timestamps = []
        self.total_words = 0
        self.filler_count = 0
        self.hedge_count = 0
        self.repetition_count = 0
        self.filler_words_found = []
        self.hedge_phrases_found = []
        self.start_time = None
        self.last_words.clear()
        self._file_mode = False
        self._file_sample_rate = 16000
        self._file_samples_read = 0
        self._audio_summary = None
