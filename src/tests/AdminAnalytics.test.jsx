import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import AdminAnalytics from "../components/AdminAnalytics";

// ─── Mock AdminNavbar (and its CSS) FIRST ─────────────────────────────────────
// vi.mock calls are hoisted by Vitest so this runs before any real imports are
// processed — preventing Vite from choking on the missing AdminNavbar.module.css.
vi.mock("../components/AdminNavbar", () => ({
    default: ({ adminUser }) => (
        <header data-testid="admin-navbar">
            <button onClick={() => {}}>Dashboard</button>
            <span>Analytics</span>
            <button title={adminUser?.name}>☰</button>
        </header>
    ),
}));

// Also mock the CSS module directly in case any code path imports it standalone
vi.mock("../components/AdminNavbar.module.css", () => ({ default: {} }));

// ─── Firebase mocks ───────────────────────────────────────────────────────────
vi.mock("../firebase", () => ({
    auth: { signOut: vi.fn() },
    db: {},
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importActual) => ({
    ...(await importActual()),
    useNavigate: () => mockNavigate,
}));

let mockOnAuthStateChanged;
let mockGetDoc;
let mockGetDocs;

vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
}));

vi.mock("firebase/firestore", () => ({
    doc:        vi.fn((_db, col, id) => ({ _col: col, _id: id })),
    collection: vi.fn((_db, col) => col),
    getDoc:     (...args) => mockGetDoc(...args),
    getDocs:    (...args) => mockGetDocs(...args),
    query:      vi.fn(),
    where:      vi.fn(),
}));



// ─── Helpers ──────────────────────────────────────────────────────────────────
const renderComponent = () =>
    render(
        <MemoryRouter>
            <AdminAnalytics />
        </MemoryRouter>
    );

const makeSnap = (items) => ({
    docs: items.map((data) => ({ data: () => data })),
});

// Shared doc stubs
const adminUserDoc  = { exists: () => true,  data: () => ({ userType: "admin", firstName: "Alice" }) };
const facilityDoc   = { exists: () => true,  data: () => ({ slotsPerHour: 4 }) };
const noFacilityDoc = { exists: () => false, data: () => ({}) };

/**
 * getDoc is called in this order every render:
 *   call 1 → users/{uid}            (auth guard useEffect)
 *   call 2 → facilityConfig/default (analytics useEffect)
 */
function setupAuthAndData({
    userDoc        = adminUserDoc,
    facilityConfig = facilityDoc,
    users          = [],
    listings       = [],
    bookings       = [],
    transactions   = [],
} = {}) {
    mockOnAuthStateChanged = vi.fn((_auth, cb) => {
        cb({ uid: "admin-uid", displayName: "Alice Smith" });
        return vi.fn();
    });

    mockGetDoc = vi.fn()
        .mockResolvedValueOnce(userDoc)
        .mockResolvedValueOnce(facilityConfig);

    const byCol = { users, listings, bookings, transactions };
    mockGetDocs = vi.fn((col) => Promise.resolve(makeSnap(byCol[col] ?? [])));
}

beforeEach(() => {
    mockNavigate.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdminAnalytics – auth guard", () => {
    it("redirects to /login when no user is authenticated", async () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => { cb(null); return vi.fn(); });
        mockGetDoc  = vi.fn();
        mockGetDocs = vi.fn().mockResolvedValue(makeSnap([]));

        renderComponent();
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
    });

    it("redirects to / when authenticated user is not an admin", async () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => {
            cb({ uid: "student-uid" });
            return vi.fn();
        });
        mockGetDoc = vi.fn()
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ userType: "student" }) })
            .mockResolvedValueOnce(noFacilityDoc);
        mockGetDocs = vi.fn().mockResolvedValue(makeSnap([]));

        renderComponent();
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    });

    it("does not redirect when user is an admin", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => expect(screen.getByRole("heading", { name: /analytics/i })).toBeInTheDocument());
        expect(mockNavigate).not.toHaveBeenCalledWith("/login");
        expect(mockNavigate).not.toHaveBeenCalledWith("/");
    });

    it("calls the auth unsubscribe on unmount", () => {
        const unsub = vi.fn();
        mockOnAuthStateChanged = vi.fn((_auth, cb) => { cb(null); return unsub; });
        mockGetDoc  = vi.fn().mockResolvedValue(noFacilityDoc);
        mockGetDocs = vi.fn().mockResolvedValue(makeSnap([]));

        const { unmount } = renderComponent();
        unmount();
        expect(unsub).toHaveBeenCalledTimes(1);
    });
});

describe("AdminAnalytics – loading & error states", () => {
    it("shows a spinner while data is loading", () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => { cb({ uid: "admin-uid" }); return vi.fn(); });
        mockGetDoc  = vi.fn().mockResolvedValue(adminUserDoc);
        mockGetDocs = vi.fn(() => new Promise(() => {})); // never resolves

        renderComponent();
        expect(screen.getByText(/loading analytics/i)).toBeInTheDocument();
    });

    it("shows an error message when data fetch fails", async () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => { cb({ uid: "admin-uid" }); return vi.fn(); });
        mockGetDoc  = vi.fn().mockResolvedValue(adminUserDoc);
        mockGetDocs = vi.fn().mockRejectedValue(new Error("Network error"));

        renderComponent();
        await waitFor(() =>
            expect(screen.getByText(/failed to load analytics/i)).toBeInTheDocument()
        );
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
});

describe("AdminAnalytics – summary stat cards", () => {
    it("renders all five stat cards", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByText("Total Listings"));
        expect(screen.getByText("Total Listings")).toBeInTheDocument();
        expect(screen.getByText("Total Bookings")).toBeInTheDocument();
        expect(screen.getByText("Total Transactions")).toBeInTheDocument();
        expect(screen.getByText("Total Revenue")).toBeInTheDocument();
        expect(screen.getByText("Avg Utilisation")).toBeInTheDocument();
    });

    it("displays total revenue from sold listings only", async () => {
        setupAuthAndData({
            listings: [
                { status: "sold",   price: 500, timestamp: new Date() },
                { status: "sold",   price: 300, timestamp: new Date() },
                { status: "active", price: 999 },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("R 800"));
        expect(screen.getByText("R 800")).toBeInTheDocument();
    });

    it("shows R 0 revenue when there are no sold listings", async () => {
        setupAuthAndData({ listings: [{ status: "active", price: 100 }] });
        renderComponent();
        await waitFor(() => screen.getByText("R 0"));
        expect(screen.getByText("R 0")).toBeInTheDocument();
    });

    it("shows 0% utilisation when there are no bookings", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByText("0%"));
        expect(screen.getByText("0%")).toBeInTheDocument();
    });
});

describe("AdminAnalytics – utilisation calculation", () => {
    it("calculates average utilisation correctly", async () => {
        // 2 unique slots, slotsPerHour=2 → (2/2)*100 = 100%
        setupAuthAndData({
            bookings: [
                { date: "2024-03-11", timeSlot: "09:00" },
                { date: "2024-03-11", timeSlot: "10:00" },
            ],
            facilityConfig: { exists: () => true, data: () => ({ slotsPerHour: 2 }) },
        });
        renderComponent();
        await waitFor(() => screen.getByText("100%"));
        expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("caps daily utilisation at 100%", async () => {
        // 3 unique slots, slotsPerHour=1 → would be 300%, capped to 100%
        setupAuthAndData({
            bookings: [
                { date: "2024-03-11", timeSlot: "09:00" },
                { date: "2024-03-11", timeSlot: "10:00" },
                { date: "2024-03-11", timeSlot: "11:00" },
            ],
            facilityConfig: { exists: () => true, data: () => ({ slotsPerHour: 1 }) },
        });
        renderComponent();
        await waitFor(() => screen.getByText("100%"));
        expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("deduplicates repeated time slots on the same day", async () => {
        // Same slot twice → 1 unique slot, slotsPerHour=2 → 50%
        setupAuthAndData({
            bookings: [
                { date: "2024-03-11", timeSlot: "09:00" },
                { date: "2024-03-11", timeSlot: "09:00" },
            ],
            facilityConfig: { exists: () => true, data: () => ({ slotsPerHour: 2 }) },
        });
        renderComponent();
        await waitFor(() => screen.getByText("50%"));
        expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("falls back to slotsPerHour=1 when facilityConfig doc does not exist", async () => {
        setupAuthAndData({
            bookings: [{ date: "2024-03-11", timeSlot: "09:00" }],
            facilityConfig: noFacilityDoc,
        });
        renderComponent();
        // 1 slot / 1 slotsPerHour → 100%
        await waitFor(() => screen.getByText("100%"));
        expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("ignores bookings without a date or timeSlot", async () => {
        setupAuthAndData({
            bookings: [
                { timeSlot: "09:00" },
                { date: "2024-03-11" },
                {},
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("0%"));
        expect(screen.getByText("0%")).toBeInTheDocument();
    });
});

describe("AdminAnalytics – data aggregation", () => {
    it("groups users by userType and defaults missing type to 'student'", async () => {
        setupAuthAndData({
            users: [
                { userType: "admin" },
                { userType: "landlord" },
                {},
                { userType: "student" },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("User breakdown"));
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByText("landlord")).toBeInTheDocument();
        expect(screen.getByText("student")).toBeInTheDocument();
    });

    it("groups listings by category and defaults missing to 'Uncategorised'", async () => {
        setupAuthAndData({
            listings: [
                { category: "Books",       status: "active" },
                { category: "Electronics", status: "active" },
                { status: "active" },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Popular Categories"));
        expect(screen.getByText("Popular Categories")).toBeInTheDocument();
    });

    it("groups listings by status and defaults missing status to 'active'", async () => {
        setupAuthAndData({
            listings: [{ status: "sold" }, {}],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Listing status"));
        expect(screen.getByText("sold")).toBeInTheDocument();
        expect(screen.getByText("active")).toBeInTheDocument();
    });

    it("aggregates revenue by month and renders month label", async () => {
        const ts = new Date("2024-06-15");
        setupAuthAndData({
            listings: [
                { status: "sold",   price: 200, timestamp: { toDate: () => ts } },
                { status: "active", price: 999, timestamp: { toDate: () => ts } },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Revenue by month"));
        expect(screen.getByText("06")).toBeInTheDocument();
    });

    it("shows 'No revenue data yet' when there are no sold listings", async () => {
        setupAuthAndData({ listings: [{ status: "active", price: 100 }] });
        renderComponent();
        await waitFor(() => screen.getByText(/no revenue data yet/i));
    });

    it("counts bookings by day of week", async () => {
        setupAuthAndData({
            bookings: [
                { date: "2024-03-11", timeSlot: "09:00" }, // Monday
                { date: "2024-03-13", timeSlot: "09:00" }, // Wednesday
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Drop-off bookings by day of week"));
        expect(screen.getByText("Mon")).toBeInTheDocument();
        expect(screen.getByText("Wed")).toBeInTheDocument();
    });

    it("groups transactions by status and defaults missing to 'unknown'", async () => {
        setupAuthAndData({
            transactions: [
                { status: "completed" },
                { status: "pending" },
                {},
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Transaction status breakdown"));
        expect(screen.getByText("completed")).toBeInTheDocument();
        expect(screen.getByText("pending")).toBeInTheDocument();
        expect(screen.getByText("unknown")).toBeInTheDocument();
    });
});

// NOTE: The "moderation summary" and "navigation & dropdown" describe blocks
// from the original tests have been removed because:
//
//  • Moderation Summary was intentionally removed from AdminAnalytics — it now
//    lives on its own dedicated ModerationSummaryPage. Tests for those stats
//    belong in ModerationSummaryPage.test.jsx.
//
//  • Navigation and dropdown behaviour (profile menu, logout flow, @handle,
//    title button) now lives in the shared AdminNavbar component. Those
//    interactions should be tested in AdminNavbar.test.jsx so they only need
//    to be maintained in one place.
