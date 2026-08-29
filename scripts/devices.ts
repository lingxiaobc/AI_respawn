import { PvRecorder } from "@picovoice/pvrecorder-node";
import { PvSpeaker } from "@picovoice/pvspeaker-node";

function printDevices(label: string, devices: string[]): void {
  console.log(`${label} (-1 = system default)`);
  if (devices.length === 0) console.log("  no devices found");
  devices.forEach((device, index) => console.log(`  ${index}: ${device}`));
}

printDevices("Input devices", PvRecorder.getAvailableDevices());
printDevices("Output devices", PvSpeaker.getAvailableDevices());
