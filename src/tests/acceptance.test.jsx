// src/tests/acceptance.test.jsx

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";

// Mock Firebase 
vi.mock("firebase/auth", () => ({
  getAuth:                        vi.fn(() => ({})),
  onAuthStateChanged:             vi.fn((_auth, cb) => { cb(null); return () => {}; }),
  signInWithPopup:                vi.fn(),
  signOut:                        vi.fn(() => Promise.resolve()),
  GoogleAuthProvider:             vi.fn(function() {
    this.setCustomParameters = vi.fn();
  }),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
  doc:          vi.fn(),
  getDoc:       vi.fn(),
  setDoc:       vi.fn(() => Promise.resolve()),
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
}));

import {
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { getDoc } from "firebase/firestore";

const STUDENT_USER = {
  uid:         "uid-student-001",
  email:       "student@students.wits.ac.za",
  displayName: "Jane Doe",
  photoURL:    "",
};

const STUDENT_DB_DATA = {
  email:     STUDENT_USER.email,
  firstName: "Jane",
  lastName:  "Doe",
  userType:  "student",
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  onAuthStateChanged.mockImplementation((_auth, cb) => {
    cb(null);
    return () => {};
  });

  getDoc.mockResolvedValue({
    exists: () => true,
    data:   () => STUDENT_DB_DATA,
  });
});

// TEST 1

describe("Test 1 — New student signs up via Google OAuth", () => {
  it("creates account and lands on dashboard with Student role", async () => {
    const user = userEvent.setup();

    signInWithPopup.mockResolvedValue({ user: STUDENT_USER });

    render(<App />);

    expect(screen.getByText(/buy, sell & trade/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /get started/i }));
    await user.click(screen.getByRole("link",   { name: /sign up/i }));
    await user.click(screen.getByRole("button", { name: /sign up with google/i }));

    await waitFor(() => {
      expect(screen.getByText(/welcome to your dashboard/i)).toBeInTheDocument();
    });

    expect(screen.getByText("student")).toBeInTheDocument();
    expect(window.localStorage.getItem("loggedInUserId")).toBe(STUDENT_USER.uid);
  });
});

// TEST 2

describe("Test 2 — Registered student logs in with Google", () => {
  it("authenticates and redirects to dashboard", async () => {
    const user = userEvent.setup();

    signInWithPopup.mockResolvedValue({ user: STUDENT_USER });

    render(<App />);

    expect(screen.getByText(/buy, sell & trade/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /get started/i }));
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => {
      expect(screen.getByText(/welcome to your dashboard/i)).toBeInTheDocument();
    });
  });

  it("blocks non-Wits emails", async () => {
    const user = userEvent.setup();
    const NON_WITS_USER = {
      ...STUDENT_USER,
      email: "student@gmail.com",
    };

    signInWithPopup.mockResolvedValue({ user: NON_WITS_USER });

    render(<App />);

    await user.click(screen.getByRole("button", { name: /get started/i }));
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => {
      expect(screen.getByText(/only wits emails allowed/i)).toBeInTheDocument();
    });
  });
});

// TEST 3

describe("Test 3 — Unauthenticated user cannot access protected page", () => {
  it("shows login page when no session exists", async () => {
    window.localStorage.clear();
    onAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(null);
      return () => {};
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/welcome to your dashboard/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/buy, sell & trade/i)).toBeInTheDocument();
  });

  it("restores session and shows dashboard when valid session exists", async () => {
    window.localStorage.setItem("loggedInUserId", STUDENT_USER.uid);

    onAuthStateChanged.mockImplementation((_auth, cb) => {
      cb(STUDENT_USER);
      return () => {};
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/welcome to your dashboard/i)).toBeInTheDocument();
    });
  });
});
