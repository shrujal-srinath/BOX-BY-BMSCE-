// Import all the Firebase services we need from the CDN
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js";
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-check-compat.js";
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyACfaiaL8JWyKCQzdZbfakm-2nHU0",
  authDomain: "bmsce-box.firebaseapp.com",
  projectId: "bmsce-box",
  storageBucket: "bmsce-box.appspot.com",
  messagingSenderId: "385203527779",
  appId: "1:385203527779:web:96f052742085c4f53337e",
  measurementId: "G-FDCJSH8QDY"
};

// Initialize Firebase
let db;
let appCheck;
let auth;

try {
  firebase.initializeApp(firebaseConfig);
  
  // Initialize services
  db = firebase.firestore();
  auth = firebase.auth();
  appCheck = firebase.appCheck();

  // Activate App Check for development
  // This token is for your 127.0.0.1 machine
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = "5790a0e7-e070-43b9-a418-44d1819c3132"; 

  appCheck.activate(
    'SHRUJAL000', // Your reCAPTCHA v3 Site Key
    true
  );

  console.log("Firebase services initialized successfully from module.");

} catch (e) {
  console.error("Firebase initialization failed:", e);
  alert("Could not connect to the database.");
}

// Export the services so other files can import them
export { db, auth };