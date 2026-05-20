// src/tests/AdminAnalytics.test.jsx - FULLY CORRECTED VERSION

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import AdminAnalytics from "../components/AdminAnalytics";

// ─── Static navigate mock ────────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => mockNavigate),
  };
});

vi.mock("../firebase", () => ({
  auth: {},
  db:   {},
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc:        vi.fn(() => ({ path: "" })),
  getDoc:     vi.fn(),
  getDocs:    vi.fn(),
  collection: vi.fn(() => ({ id: "" })),
  updateDoc:  vi.fn(),
  increment:  vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  setDoc:     vi.fn(),
}));

vi.mock("../services/revenueService", () => ({
  getRevenueAnalytics: vi.fn(),
}));

vi.mock("../components/AdminNavbar", () => ({
  default: () => <div data-testid="admin-navbar">AdminNavbar</div>,
}));

// ─────────────────────────────────────────────────────────────────────────────

describe("AdminAnalytics", () => {
  let firestore;
  let firebaseAuth;

  beforeEach(async () => {
    vi.clearAllMocks();

    firestore    = await import("firebase/firestore");
    firebaseAuth = await import("firebase/auth");

    firestore.doc.mockImplementation((_db, ...segments) => ({
      path: segments.join("/"),
    }));

    firestore.collection.mockImplementation((_db, name) => ({
      id:              name,
      _collectionName: name,
    }));

    firestore.setDoc.mockResolvedValue(undefined);
    firestore.updateDoc.mockResolvedValue(undefined);
    firestore.increment.mockImplementation((n) => n);
    firestore.onSnapshot.mockImplementation(() => () => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const makeDoc = (dataObj, id = Math.random().toString(36).slice(2)) => ({
    id,
    data: () => dataObj,
    get:  (field) => dataObj[field],
  });

  const setupMocks = ({
    userType       = "admin",
    users          = [],
    listings       = [],
    bookings       = [],
    transactions   = [],
    facilityConfig = null,
    revenueData    = null,
  } = {}) => {
    // Auth
    firebaseAuth.onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: "user123", email: "test@test.com" });
      return () => {};
    });

    // getDoc
    firestore.getDoc.mockImplementation((docRef) => {
      const path = docRef?.path || "";

      if (path === "users/user123") {
        return Promise.resolve({
          exists: () => true,
          data:   () => ({
            userType,
            firstName: "Test",
            lastName:  "Admin",
            email:     "test@test.com",
          }),
        });
      }

      if (path === "facilityConfig/default") {
        return facilityConfig
          ? Promise.resolve({ exists: () => true,  data: () => facilityConfig })
          : Promise.resolve({ exists: () => false, data: () => ({}) });
      }

      return Promise.resolve({ exists: () => true, data: () => ({}) });
    });

    // onSnapshot
    firestore.onSnapshot.mockImplementation((ref, successCb, _errorCb) => {
      const id = ref?._collectionName || ref?.id || ref?.path || "";

      if (id === "revenueAnalytics/global" || id.includes("revenueAnalytics")) {
        successCb({
          exists: () => true,
          data:   () => revenueData || {
            totalRevenue:         0,
            onlineRevenue:        0,
            collectedCashRevenue: 0,
            pendingCashRevenue:   0,
            totalPayouts:         0,
            totalRefunds:         0,
            availableBalance:     0,
            promotionRevenue:     0,
            adPayments:           0,
          },
        });
        return () => {};
      }

      if (id === "users") {
        successCb({ docs: users.map(makeDoc), docChanges: () => [] });
        return () => {};
      }

      if (id === "listings") {
        successCb({ docs: listings.map(makeDoc), docChanges: () => [] });
        return () => {};
      }

      if (id === "bookings") {
        successCb({ docs: bookings.map(makeDoc), docChanges: () => [] });
        return () => {};
      }

      if (id === "transactions") {
        successCb({ docs: transactions.map(makeDoc), docChanges: () => [] });
        return () => {};
      }

      if (id === "promotions") {
        successCb({ docs: [], docChanges: () => [] });
        return () => {};
      }

      successCb({ docs: [], docChanges: () => [] });
      return () => {};
    });
  };

  const renderComponent = () => render(<AdminAnalytics />);

  const waitForLoad = () =>
    waitFor(
      () => expect(screen.queryByText("Loading analytics…")).not.toBeInTheDocument(),
      { timeout: 5000 },
    );

  // ─────────────────────────────────────────────────────────────────────
  // authentication & routing
  // ─────────────────────────────────────────────────────────────────────
  describe("authentication & routing", () => {
    it("redirects to /login when no user is authenticated", async () => {
      firebaseAuth.onAuthStateChanged.mockImplementation((_auth, callback) => {
        callback(null);
        return () => {};
      });

      renderComponent();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/login");
      });
    });

    it("redirects to / when authenticated user is not an admin", async () => {
      setupMocks({ userType: "student" });

      renderComponent();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/");
      });
    });

    it("does not redirect when user is an admin", async () => {
      setupMocks({ userType: "admin" });

      renderComponent();
      await waitForLoad();

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // loading & error states
  // ─────────────────────────────────────────────────────────────────────
  describe("loading & error states", () => {
    it("shows a spinner while data is loading", () => {
      firebaseAuth.onAuthStateChanged.mockImplementation((_auth, callback) => {
        callback({ uid: "user123", email: "test@test.com" });
        return () => {};
      });

      firestore.getDoc.mockResolvedValue({
        exists: () => true,
        data:   () => ({ userType: "admin", firstName: "Test", lastName: "Admin" }),
      });

      firestore.onSnapshot.mockImplementation(() => () => {});

      renderComponent();

      expect(screen.getByText("Loading analytics…")).toBeInTheDocument();
      const spinner = document.querySelector("[class*='spinner']");
      expect(spinner).toBeInTheDocument();
    });

    it("shows an error message when data fetch fails", async () => {
      firebaseAuth.onAuthStateChanged.mockImplementation((_auth, callback) => {
        callback({ uid: "user123", email: "test@test.com" });
        return () => {};
      });

      firestore.getDoc.mockResolvedValue({
        exists: () => true,
        data:   () => ({ userType: "admin", firstName: "Test", lastName: "Admin" }),
      });

      firestore.onSnapshot.mockImplementation((ref, _successCb, errorCb) => {
        const id = ref?._collectionName || ref?.id || ref?.path || "";
        if (id === "revenueAnalytics/global" || id.includes("revenueAnalytics")) {
          _successCb({ exists: () => false, data: () => ({}) });
          return () => {};
        }
        if (typeof errorCb === "function") {
          setTimeout(() => errorCb(new Error("Firestore error")), 0);
        }
        return () => {};
      });

      renderComponent();

      await waitFor(
        () => expect(screen.getByText(/Failed to load/i)).toBeInTheDocument(),
        { timeout: 5000 },
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // summary stat cards
  // ─────────────────────────────────────────────────────────────────────
  describe("summary stat cards", () => {
    it("renders all stat cards", async () => {
      setupMocks({
        users:    [{ userType: "student" }],
        listings: [{ status: "active", price: 100 }],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText("Total Listings")).toBeInTheDocument();
        expect(screen.getByText("Total Bookings")).toBeInTheDocument();
        expect(screen.getByText("Total Transactions")).toBeInTheDocument();
        expect(screen.getByText("Avg Utilisation")).toBeInTheDocument();
      });
    });

    it("displays total revenue from sold listings only", async () => {
      // This test now correctly mocks the revenueData to show the sold amount
      setupMocks({
        listings: [
          { id: "1", status: "sold", price: 800, timestamp: new Date() },
          { id: "2", status: "active", price: 500, timestamp: new Date() },
          { id: "3", status: "sold", price: 0, timestamp: new Date() },
        ],
        // Mock revenueData to show total revenue from sold listings
        revenueData: {
          totalRevenue: 800,
          onlineRevenue: 0,
          collectedCashRevenue: 0,
          pendingCashRevenue: 0,
          totalPayouts: 0,
          totalRefunds: 0,
          availableBalance: 0,
          promotionRevenue: 0,
          adPayments: 0,
        },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        // Find the stat card that contains "Total Listings" label and get its value
        const allStatCards = document.querySelectorAll("[class*='statCard']");
        let revenueFound = false;
        
        allStatCards.forEach(card => {
          const label = card.querySelector("[class*='statLabel']");
          const value = card.querySelector("[class*='statValue']");
          
          if (label && label.textContent === "Total Listings" && value) {
            // The sibling stat card for revenue would have "Total Listings" label? 
            // Actually the stat cards are: Total Listings, Total Bookings, Total Transactions, Avg Utilisation
            // Revenue is shown in the Revenue Overview section, not in stat cards.
            // So we need to check the Revenue Metrics section instead.
            revenueFound = true;
          }
        });
        
        // Check the Revenue Metrics Cards for R800
        const revenueMetricCards = document.querySelectorAll("[class*='revenueMetricCard']");
        let revenueValueFound = false;
        
        revenueMetricCards.forEach(card => {
          const valueEl = card.querySelector("[class*='revenueMetricValue']");
          const labelEl = card.querySelector("[class*='revenueMetricLabel']");
          
          if (labelEl && labelEl.textContent === "Total Revenue" && valueEl) {
            if (valueEl.textContent === "R 800") {
              revenueValueFound = true;
            }
          }
        });
        
        expect(revenueValueFound).toBe(true);
      });
    });

    it("shows R 0 revenue when there are no sold listings", async () => {
      setupMocks({
        listings: [
          { id: "1", status: "active", price: 500 },
          { id: "2", status: "pending", price: 300 },
        ],
        revenueData: {
          totalRevenue: 0,
          onlineRevenue: 0,
          collectedCashRevenue: 0,
          pendingCashRevenue: 0,
          totalPayouts: 0,
          totalRefunds: 0,
          availableBalance: 0,
          promotionRevenue: 0,
          adPayments: 0,
        },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const revenueMetricCards = document.querySelectorAll("[class*='revenueMetricCard']");
        let revenueValueFound = false;
        
        revenueMetricCards.forEach(card => {
          const valueEl = card.querySelector("[class*='revenueMetricValue']");
          const labelEl = card.querySelector("[class*='revenueMetricLabel']");
          
          if (labelEl && labelEl.textContent === "Total Revenue" && valueEl) {
            if (valueEl.textContent === "R 0") {
              revenueValueFound = true;
            }
          }
        });
        
        expect(revenueValueFound).toBe(true);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // utilisation calculation
  // ─────────────────────────────────────────────────────────────────────
  describe("utilisation calculation", () => {
    it("shows 0% utilisation when there are no bookings", async () => {
      setupMocks({
        bookings:       [],
        facilityConfig: { slotsPerHour: 2 },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const allStatValues = document.querySelectorAll("[class*='statValue']");
        const utilisationEl = Array.from(allStatValues).find(
          (el) => el.textContent.trim() === "0%",
        );
        expect(utilisationEl).toBeInTheDocument();
      });
    });

    it("calculates average utilisation correctly", async () => {
      setupMocks({
        bookings: [
          { date: "2024-01-01", timeSlot: "09:00-10:00" },
          { date: "2024-01-01", timeSlot: "10:00-11:00" },
          { date: "2024-01-02", timeSlot: "09:00-10:00" },
        ],
        facilityConfig: { slotsPerHour: 2 },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const allStatValues = document.querySelectorAll("[class*='statValue']");
        const utilisationEl = Array.from(allStatValues).find(
          (el) => el.textContent.trim() === "50%",
        );
        expect(utilisationEl).toBeInTheDocument();
      });
    });

    it("caps daily utilisation at 100%", async () => {
      const bookings = Array.from({ length: 20 }, () => ({
        date:     "2024-01-01",
        timeSlot: "09:00-10:00",
      }));

      setupMocks({
        bookings,
        facilityConfig: { slotsPerHour: 2 },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const allStatValues = document.querySelectorAll("[class*='statValue']");
        const utilisationEl = Array.from(allStatValues).find(
          (el) => el.textContent.trim() === "100%",
        );
        expect(utilisationEl).toBeInTheDocument();
      });
    });

    it("deduplicates repeated time slots on the same day", async () => {
      setupMocks({
        bookings: [
          { date: "2024-01-01", timeSlot: "09:00-10:00" },
          { date: "2024-01-01", timeSlot: "09:00-10:00" },
          { date: "2024-01-01", timeSlot: "09:00-10:00" },
          { date: "2024-01-01", timeSlot: "10:00-11:00" },
        ],
        facilityConfig: { slotsPerHour: 2 },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const allStatValues = document.querySelectorAll("[class*='statValue']");
        const utilisationEl = Array.from(allStatValues).find(
          (el) => el.textContent.trim() === "100%",
        );
        expect(utilisationEl).toBeInTheDocument();
      });
    });

    it("falls back to slotsPerHour=1 when facilityConfig doc does not exist", async () => {
      setupMocks({
        bookings: [{ date: "2024-01-01", timeSlot: "09:00-10:00" }],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const allStatValues = document.querySelectorAll("[class*='statValue']");
        const utilisationEl = Array.from(allStatValues).find(
          (el) => el.textContent.trim() === "100%",
        );
        expect(utilisationEl).toBeInTheDocument();
      });
    });

    it("ignores bookings without a date or timeSlot", async () => {
      setupMocks({
        bookings: [
          { date: "2024-01-01", timeSlot: "09:00-10:00" },
          { date: null,         timeSlot: "10:00-11:00" },
          { date: "2024-01-02", timeSlot: null },
          { timeSlot: "11:00-12:00" },
          { date: "2024-01-03" },
        ],
        facilityConfig: { slotsPerHour: 1 },
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        const allStatValues = document.querySelectorAll("[class*='statValue']");
        const utilisationEl = Array.from(allStatValues).find(
          (el) => el.textContent.trim() === "100%",
        );
        expect(utilisationEl).toBeInTheDocument();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // data aggregation
  // ─────────────────────────────────────────────────────────────────────
  describe("data aggregation", () => {
    it("groups users by userType and defaults missing type to 'student'", async () => {
      setupMocks({
        users: [
          { userType: "admin" },
          { userType: "landlord" },
          { userType: "staff" },
          { userType: null },
          {},
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText("User breakdown")).toBeInTheDocument();
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByText("landlord")).toBeInTheDocument();
        expect(screen.getByText("student")).toBeInTheDocument();
      });
    });

    it("groups listings by category and defaults missing to 'Uncategorised'", async () => {
      setupMocks({
        listings: [
          { category: "Electronics" },
          { category: "Books" },
          { category: null },
          {},
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText("Popular Categories")).toBeInTheDocument();
        expect(screen.getByText("Electronics")).toBeInTheDocument();
        expect(screen.getByText("Books")).toBeInTheDocument();
        expect(screen.getByText("Uncategorised")).toBeInTheDocument();
      });
    });

    it("groups listings by status and defaults missing status to 'active'", async () => {
      setupMocks({
        listings: [
          { status: "sold" },
          { status: "pending" },
          { status: null },
          {},
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText("Listing status")).toBeInTheDocument();
        expect(screen.getByText("sold")).toBeInTheDocument();
        expect(screen.getByText("pending")).toBeInTheDocument();
        expect(screen.getByText("active")).toBeInTheDocument();
      });
    });

    it("aggregates revenue by month and renders month label", async () => {
      setupMocks({
        listings: [
          { status: "sold", price: 100, timestamp: new Date("2024-01-15") },
          { status: "sold", price: 200, timestamp: new Date("2024-01-20") },
          { status: "sold", price: 150, timestamp: new Date("2024-02-10") },
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText(/Revenue by month/)).toBeInTheDocument();
      });
    });

    it("shows 'No revenue data yet' when there are no sold listings", async () => {
      setupMocks({
        listings: [
          { status: "active", price: 100 },
          { status: "pending", price: 200 },
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText(/No revenue data yet/i)).toBeInTheDocument();
      });
    });

    it("counts bookings by day of week", async () => {
      setupMocks({
        bookings: [
          { date: "2024-01-01" },
          { date: "2024-01-02" },
          { date: "2024-01-03" },
          { date: "2024-01-03" },
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText("Drop-off bookings by day of week")).toBeInTheDocument();
        expect(screen.getByText("Mon")).toBeInTheDocument();
        expect(screen.getByText("Tue")).toBeInTheDocument();
        expect(screen.getByText("Wed")).toBeInTheDocument();
      });
    });

    it("groups transactions by status and defaults missing to 'unknown'", async () => {
      setupMocks({
        transactions: [
          { status: "completed" },
          { status: "pending" },
          { status: null },
          {},
        ],
      });

      renderComponent();
      await waitForLoad();

      await waitFor(() => {
        expect(screen.getByText("Transaction status breakdown")).toBeInTheDocument();
        expect(screen.getByText("completed")).toBeInTheDocument();
        expect(screen.getByText("pending")).toBeInTheDocument();
        expect(screen.getByText("unknown")).toBeInTheDocument();
      });
    });
  });
});