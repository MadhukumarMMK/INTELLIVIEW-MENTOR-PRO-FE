import * as faceapi from 'face-api.js';

// Paths to the pre-trained models
const MODEL_URL = '/models';

// Function to load all necessary models
export const loadModels = async () => {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    console.log("Face-API models loaded successfully.");
  } catch (error) {
    console.error("Error loading Face-API models:", error);
  }
};
