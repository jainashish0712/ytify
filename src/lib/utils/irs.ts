// src/lib/utils/irs.ts

export const IRS_OPTIONS = [
  {
    category: "Joe0Bloggs 3D headphones",
    files: [
      { name: "testeqapo3", path: "/irs/testeqapo3.wav" },
      { name: "Surround Upmix 44.1kHz (IRS)", path: "/irs/Joe0Bloggs 3D headphones IRS--surround upmix-44100_.irs" },
      { name: "Surround Upmix 48kHz (WAV)", path: "/irs/Joe0Bloggs 3D headphones IRS--surround upmix-48000.wav" },
    ],
  },
  {
    category: "Orchestra",
    files: [
      { name: "Standard (IRS)", path: "/irs/Orchestra.irs" },
      { name: "Standard (WAV)", path: "/irs/Orchestra.wav" },
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
