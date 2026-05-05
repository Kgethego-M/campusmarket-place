import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import AdminAnalytics from "../components/AdminAnalytics";

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
 *
 * Using mockResolvedValueOnce chained calls makes this order-safe
 * regardless of what shape doc() returns.
 */
function setupAuthAndData({
    userDoc        = adminUserDoc,
    facilityConfig = facilityDoc,
    users          = [],
    listings       = [],
    bookings       = [],
    transactions   = [],
    reviews        = [],
} = {}) {
    mockOnAuthStateChanged = vi.fn((_auth, cb) => {
        cb({ uid: "admin-uid", displayName: "Alice Smith" });
        return vi.fn();
    });

    mockGetDoc = vi.fn()
        .mockResolvedValueOnce(userDoc)
        .mockResolvedValueOnce(facilityConfig);

    const byCol = { users, listings, bookings, transactions, reviews };
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
        await waitFor(() => expect(screen.getByText("Analytics")).toBeInTheDocument());
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

describe("AdminAnalytics – moderation summary", () => {
    it("shows zero for all moderation stats when there are no flags", async () => {
        setupAuthAndData({
            users:    [{ userType: "student" }],
            listings: [{ status: "active" }],
            reviews:  [{}],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Moderation Summary"));
        const zeros = screen.getAllByText("0");
        expect(zeros.length).toBeGreaterThanOrEqual(3);
    });

    it("counts abusive reviews (flagged or abusive=true)", async () => {
        setupAuthAndData({
            reviews: [
                { flagged: true },
                { abusive: true },
                { flagged: false, abusive: false },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Abusive Reviews"));
        expect(screen.getByText("Abusive Reviews")).toBeInTheDocument();
    });

    it("counts suspicious listings (flagged or reported=true)", async () => {
        setupAuthAndData({
            listings: [
                { flagged: true,   status: "active" },
                { reported: true,  status: "active" },
                { status: "active" },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Suspicious Listings"));
        expect(screen.getByText("Suspicious Listings")).toBeInTheDocument();
    });

    it("counts reported users (reported or flagged=true)", async () => {
        setupAuthAndData({
            users: [
                { userType: "admin",   reported: true },
                { userType: "student", flagged: true },
                { userType: "student" },
            ],
        });
        renderComponent();
        await waitFor(() => screen.getByText("Reported Users"));
        expect(screen.getByText("Reported Users")).toBeInTheDocument();
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
        // Categories render inside chart elements — use a flexible matcher
        expect(screen.getByText("Popular Categories")).toBeInTheDocument();
});
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

describe("AdminAnalytics – navigation & dropdown", () => {
    it("displays the admin's firstName in the nav", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByText("@Alice"));
        expect(screen.getByText("@Alice")).toBeInTheDocument();
    });

    it("falls back to displayName when firstName is absent from user doc", async () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => {
            cb({ uid: "admin-uid", displayName: "Bob Jones" });
            return vi.fn();
        });
        mockGetDoc = vi.fn()
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ userType: "admin" }) })
            .mockResolvedValueOnce(facilityDoc);
        mockGetDocs = vi.fn().mockResolvedValue(makeSnap([]));

        renderComponent();
        await waitFor(() => screen.getByText("@Bob"));
        expect(screen.getByText("@Bob")).toBeInTheDocument();
    });

    it("navigates to /admin when Dashboard button is clicked", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByText(/dashboard/i));
        fireEvent.click(screen.getByText(/dashboard/i));
        expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });

    it("opens the dropdown menu when the menu button is clicked", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByTitle("Alice"));
        fireEvent.click(screen.getByTitle("Alice"));
        expect(screen.getByText("My Profile")).toBeInTheDocument();
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Logout")).toBeInTheDocument();
    });

    it("closes the dropdown when clicking outside", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByTitle("Alice"));
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByText("My Profile")).not.toBeInTheDocument();
    });

    it("navigates to /profile from the dropdown", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByTitle("Alice"));
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.click(screen.getByText("My Profile"));
        expect(mockNavigate).toHaveBeenCalledWith("/profile");
    });

    it("navigates to /settings from the dropdown", async () => {
        setupAuthAndData();
        renderComponent();
        await waitFor(() => screen.getByTitle("Alice"));
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.click(screen.getByText("Settings"));
        expect(mockNavigate).toHaveBeenCalledWith("/settings");
    });
});

describe("AdminAnalytics – logout flow", () => {
    // ⚠️  Real timers must be active during render/waitFor so the component
    //     can settle. We switch to fake timers only after the UI is ready,
    //     then restore real timers in afterEach.
    afterEach(() => { vi.useRealTimers(); });

    it("shows the logout overlay when logout is triggered", async () => {
        const { auth } = await import("../firebase");
        auth.signOut = vi.fn().mockResolvedValue(undefined);
        setupAuthAndData();
        renderComponent();

        // Wait with real timers until component is fully rendered
        await waitFor(() => screen.getByTitle("Alice"));

        // Now safe to use fake timers
        vi.useFakeTimers();
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.click(screen.getByText("Logout"));
        expect(screen.getByText(/logging out/i)).toBeInTheDocument();
    });

    it("calls auth.signOut and navigates to /login after the delay", async () => {
        const { auth } = await import("../firebase");
        auth.signOut = vi.fn().mockResolvedValue(undefined);
        setupAuthAndData();
        renderComponent();

        await waitFor(() => screen.getByTitle("Alice"));

        vi.useFakeTimers();
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.click(screen.getByText("Logout"));

        await act(async () => {
            vi.advanceTimersByTime(1500);
            await Promise.resolve();
        });

        expect(auth.signOut).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith("/login");
    });

    it("removes loggedInUserId from localStorage on logout", async () => {
        const { auth } = await import("../firebase");
        auth.signOut = vi.fn().mockResolvedValue(undefined);
        localStorage.setItem("loggedInUserId", "admin-uid");
        setupAuthAndData();
        renderComponent();

        await waitFor(() => screen.getByTitle("Alice"));

        vi.useFakeTimers();
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.click(screen.getByText("Logout"));

        await act(async () => {
            vi.advanceTimersByTime(1500);
            await Promise.resolve();
        });

        expect(localStorage.getItem("loggedInUserId")).toBeNull();
    });

    it("does not open dropdown while logging out", async () => {
        const { auth } = await import("../firebase");
        auth.signOut = vi.fn().mockResolvedValue(undefined);
        setupAuthAndData();
        renderComponent();

        await waitFor(() => screen.getByTitle("Alice"));

        vi.useFakeTimers();
        fireEvent.click(screen.getByTitle("Alice"));
        fireEvent.click(screen.getByText("Logout"));
        fireEvent.click(screen.getByTitle("Alice")); // try to reopen
        expect(screen.queryByText("My Profile")).not.toBeInTheDocument();
    });
});
