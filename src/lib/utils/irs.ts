// src/lib/utils/irs.ts

export const IRS_OPTIONS = [
  {
    category: "fabfilter and eq",//# VSTPlugin: Library "FabFilter\FabFilter Pro-R.dll" Space 0.267944 "Decay Rate" 0.211833 Brightness 0.695472 Character 0.0495833 Distance 0.555056 "Stereo Width" 0.616771 Mix 0.801389 "Lock Mix" 1 "Decay EQ Band 1 State" 0.5 "Decay EQ Band 1 Frequency" 0.689441 "Decay EQ Band 1 Rate" 0.938748 "Decay EQ Band 1 Q" 0.299052 "Decay EQ Band 1 Shape" 0.666667 "Post EQ Band 2 Slope" 0.25 "Decay EQ Band 2 State" 1 "Decay EQ Band 2 Frequency" 0.575188 "Decay EQ Band 2 Rate" 0.75 "Decay EQ Band 2 Q" 0.5 "Decay EQ Band 2 Shape" 0 "Decay EQ Band 3 State" 1 "Decay EQ Band 3 Frequency" 0.575188 "Decay EQ Band 3 Rate" 0.75 "Decay EQ Band 3 Q" 0.5 "Decay EQ Band 3 Shape" 0 "Decay EQ Band 4 State" 1 "Decay EQ Band 4 Frequency" 0.575188 "Decay EQ Band 4 Rate" 0.75 "Decay EQ Band 4 Q" 0.5 "Decay EQ Band 4 Shape" 0 "Decay EQ Band 5 State" 1 "Decay EQ Band 5 Frequency" 0.575188 "Decay EQ Band 5 Rate" 0.75 "Decay EQ Band 5 Q" 0.5 "Decay EQ Band 5 Shape" 0 "Decay EQ Band 6 State" 1 "Decay EQ Band 6 Frequency" 0.575188 "Decay EQ Band 6 Rate" 0.75 "Decay EQ Band 6 Q" 0.5 "Decay EQ Band 6 Shape" 0 "Post EQ Band 1 State" 0.5 "Post EQ Band 1 Frequency" 0.299321 "Post EQ Band 4 Frequency" 0.723159 "Post EQ Band 1 Gain" 0.5 "Post EQ Band 1 Q" 0.5 "Post EQ Band 1 Shape" 0.5 "Post EQ Band 1 Slope" 0.25 "Post EQ Band 2 State" 0.5 "Post EQ Band 2 Frequency" 0.783496 "Post EQ Band 2 Gain" 0.601455 "Post EQ Band 2 Q" 0.493167 "Post EQ Band 2 Shape" 0.75 "Post EQ Band 3 State" 0.5 "Post EQ Band 3 Frequency" 0.84827 "Predelay Offset" 0.5 "Post EQ Band 3 Gain" 0.5 "Post EQ Band 3 Q" 0.551273 "Post EQ Band 3 Shape" 1 "Post EQ Band 3 Slope" 0.25 "Post EQ Band 4 State" 0.5 "Post EQ Band 4 Gain" 0.447636 "Post EQ Band 4 Q" 0.503143 "Post EQ Band 4 Shape" 0 "Post EQ Band 4 Slope" 0.25 "Post EQ Band 5 State" 1 "Post EQ Band 5 Frequency" 0.575188 "Output Level" 0.5 "Post EQ Band 5 Gain" 0.5 "Post EQ Band 5 Q" 0.5 "Post EQ Band 5 Shape" 0 "Post EQ Band 5 Slope" 0.25 "Post EQ Band 6 State" 1 "Post EQ Band 6 Frequency" 0.575188 "Post EQ Band 6 Gain" 0.5 "Post EQ Band 6 Q" 0.5 "Post EQ Band 6 Shape" 0 "Post EQ Band 6 Slope" 0.25 Predelay 0.168944 "Predelay Sync" 0 "Input Level" 0.5 "Input Pan" 0.5 "Output Pan" 0.5 Bypass 0 "Analyzer Mode" 0.5 "Display Range" 0.5 "Midi State" 0 # GraphicEQ: 25 -2.8; 40 -1.2; 63 -1.2; 100 -2.8; 160 -6; 250 -2.8; 400 -1.2; 630 0.4; 1000 3.6; 1600 5.2; 2500 3.6; 4000 9.2; 6300 13.1; 10000 18; 16000 2
    files: [
      { name: "Standard (WAV)", path: "https://raw.githubusercontent.com/jainashish0712/ytify/07864fe96bc3edb15cafc8db86c7f791da3f9b10/public/irs/fabfilterandeq.wav" },
      { name: "Standard (IRS)", path: "/irs/Orchestra.irs" },
    ],
  },
  {
    category: "Joe0Bloggs 3D headphones",
    files: [
      { name: "Surround Upmix 44.1kHz", path: "/irs/Joe0Bloggs 3D headphones IRS--surround upmix-44100.irs" },
      { name: "Surround Upmix 48kHz (WAV)", path: "/irs/Joe0Bloggs 3D headphones IRS--surround upmix-48000.wav" },
    ],
  },
];

/**
 * Returns the full path for a given IRS category and file name.
 * @param category The category name (e.g., "Joe0Bloggs 3D headphones")
 * @param fileName The file name (e.g., "Surround Upmix 44.1kHz")
 * @returns The full path to the IRS file, or null if not found.
 */
export function getIrsPath(category: string, fileName: string): string | null {
  const selectedCategory = IRS_OPTIONS.find(opt => opt.category === category);
  if (!selectedCategory) {
    console.warn(`IRS category '${category}' not found.`);
    return null;
  }
  const selectedFile = selectedCategory.files.find(file => file.name === fileName);
  if (!selectedFile) {
    console.warn(`IRS file '${fileName}' not found in category '${category}'.`);
    return null;
  }
  return selectedFile.path;
}
