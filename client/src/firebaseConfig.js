// client/src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAl0hmstOB8QMwMjoPSK9vrGxg8IvRbwN8",
    authDomain: "silvercare-941a1.firebaseapp.com",
    projectId: "silvercare-941a1",
    storageBucket: "silvercare-941a1.firebasestorage.app",
    messagingSenderId: "253092870908",
    appId: "1:253092870908:web:23f1dc717ab7cc33777579",
    measurementId: "G-PV4BQ0MTV5"
  };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();