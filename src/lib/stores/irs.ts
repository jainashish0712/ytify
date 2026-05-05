// src/lib/stores/irs.ts
import { createStore } from "solid-js/store";
import { IRS_OPTIONS } from "../utils/irs";
// import { IRS_OPTIONS } from '@utils/irs';

type IrsStore = {
  selectedCategory: string;
  selectedFile: string;
}

const initialState: IrsStore = {
  selectedCategory: IRS_OPTIONS[0].category, // Default to the first category
  selectedFile: IRS_OPTIONS[0].files[0].name, // Default to the first file in the first category
};

export const [irsStore, setIrsStore] = createStore(initialState);

export function updateSelectedIrsCategory(category: string) {
  setIrsStore('selectedCategory', category);
  // Reset selected file to the first file of the new category
  const selectedCat = IRS_OPTIONS.find(opt => opt.category === category);
  if (selectedCat && selectedCat.files.length > 0) {
    setIrsStore('selectedFile', selectedCat.files[0].name);
  }
}

export function updateSelectedIrsFile(file: string) {
  setIrsStore('selectedFile', file);
}

/**
 * Validates and fixes the current state to ensure selectedFile exists in selectedCategory.
 * Call this before using irsStore values to prevent mismatches.
 */
export function validateAndFixIrsState() {
  const current = irsStore;
  const selectedCat = IRS_OPTIONS.find(opt => opt.category === current.selectedCategory);

  // If category doesn't exist, reset to first category
  if (!selectedCat) {
    setIrsStore('selectedCategory', IRS_OPTIONS[0].category);
    setIrsStore('selectedFile', IRS_OPTIONS[0].files[0].name);
    return;
  }

  // If file doesn't exist in category, reset to first file of category
  if (!selectedCat.files.find(f => f.name === current.selectedFile)) {
    setIrsStore('selectedFile', selectedCat.files[0].name);
  }
}
