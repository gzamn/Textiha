/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  getDocFromServer,
  serverTimestamp,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App instance
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auth and Firestore
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Database instance (using custom firestore database if configured)
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Connection test
export async function validateFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firestore connection check: offline or awaiting network.", error);
    }
  }
}
validateFirestoreConnection();

export interface UserProfileData {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  geminiApiKey?: string;
  updatedAt?: any;
  createdAt?: any;
}

// Sign in with Google Popup
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  // Sync basic user document in Firestore
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      geminiApiKey: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(
      userRef,
      {
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  return user;
}

// Sign out
export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

// Fetch user profile from Firestore
export async function fetchUserProfile(uid: string): Promise<UserProfileData | null> {
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfileData;
    }
    return null;
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return null;
  }
}

// Save user's personal Gemini API key in Firestore
export async function saveUserGeminiApiKey(uid: string, geminiApiKey: string): Promise<void> {
  const userRef = doc(db, "users", uid);
  await setDoc(
    userRef,
    {
      geminiApiKey: geminiApiKey.trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Save transcription project to Firestore history
export async function saveTranscriptionToHistory(
  uid: string,
  projectData: {
    audioName: string;
    audioDuration: number;
    segments: any[];
    guidelines?: string;
  }
): Promise<string> {
  const projectId = "proj_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const projRef = doc(db, "users", uid, "transcriptions", projectId);
  await setDoc(projRef, {
    id: projectId,
    userId: uid,
    audioName: projectData.audioName,
    audioDuration: projectData.audioDuration,
    segments: projectData.segments,
    guidelines: projectData.guidelines || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return projectId;
}

// Fetch recent projects history
export async function fetchUserTranscriptionHistory(uid: string): Promise<any[]> {
  try {
    const colRef = collection(db, "users", uid, "transcriptions");
    const q = query(colRef, orderBy("createdAt", "desc"), limit(10));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => docSnap.data());
  } catch (err) {
    console.error("Error loading transcription history:", err);
    return [];
  }
}
