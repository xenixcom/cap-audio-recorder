import { AudioRecorder } from '@xenix/cap-audio-recorder';

window.testEcho = () => {
    const inputValue = document.getElementById("echoInput").value;
    AudioRecorder.echo({ value: inputValue })
}
