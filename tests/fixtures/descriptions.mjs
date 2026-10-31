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

// Second fixture with a different composition so tests never assume one subject type.
export const animeDescription = {
  summary: "An illustrated character with silvery light-blue layered hair poses against a gray checkerboard background.",
  sections: {
    appearance: "The illustration shows a character with shoulder-length light-blue hair, dark eyes and a small earring in the visible ear.",
    clothing: "An open white long-sleeved shirt is worn over a gray cropped top, with black shorts trimmed in white.",
    pose: "One hand rests near the upper chest while the other is raised beside the head; the lower support is outside the frame.",
    composition: "The figure is centered vertically, outlined by a white border over a gray checkerboard backdrop.",
    style: "Clean digital anime line art with soft cel shading and a cool limited palette.",
    mood: "Soft frontal lighting and a gentle smile give the image a calm atmosphere.",
  },
  evidence: {
    confirmed: ["Light-blue layered hair is visible.", "A gray checkerboard pattern forms the background."],
    uncertain: ["The seating surface is outside the frame and may be a chair or floor."],
  },
  prompt: "Illustrate a centered anime character with light-blue layered hair, an open white shirt over a gray crop top and black shorts, posed on a gray checkerboard background.",
};
