// Test data for contract validation, never a product fallback or a model answer.
export const shapesDescription = {
  summary: "A red circle and a blue rectangle are arranged on a white background.",
  sections: {
    appearance: "The two shapes have solid red and blue fills with sharp boundaries.",
    clothing: "No people or clothing are visible.",
    pose: "The circle is on the left and the rectangle is on the right.",
    composition: "The shapes are separated horizontally with white space around them.",
    style: "This is a flat geometric graphic with solid colors.",
    mood: "The bright colors and simple arrangement give the image a clean visual atmosphere.",
  },
  evidence: { confirmed: ["A red circle is visible.", "A blue rectangle is visible."], uncertain: [] },
  prompt: "Create a flat graphic with a red circle to the left of a blue rectangle on white.",
};
