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
