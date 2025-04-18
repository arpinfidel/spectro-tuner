# Tuner
![image](https://github.com/user-attachments/assets/9abf08e2-5427-4e99-9ecf-7fb382933552)

A web-based audio spectrum analyzer and tuner application. Inspired by PitchLab tuner.

## Description

This application uses the Web Audio API to capture audio from the user's microphone and performs a Fast Fourier Transform (FFT) to analyze the frequency spectrum of the audio. The application then displays the spectrum in a visual representation, and also detects the pitch of the audio and displays it to the user.

## Usage

1. Install dependencies:

    ```bash
    npm install
    ```

2. Run the development server:

    ```bash
    npm start
    ```

Open `index.html` in your browser.

## Dependencies

- webfft

## Features

- Real-time audio spectrum analysis
- Pitch detection and display
- Adjustable parameters for audio processing
