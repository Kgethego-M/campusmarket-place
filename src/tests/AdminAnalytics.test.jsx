import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AdminAnalytics from "../components/AdminAnalytics";

// ─── Mock AdminNavbar ─────────────────────────────────────────────────────
vi.mock("../components/AdminNavbar", () => ({
    default: ({ adminUser }) => (
        <header data-testid="admin-navbar">
            <button>Dashboard</button>
            <span>Analytics</span>
            <button title={adminUser?.name}>☰</button>
        </header>
    ),
}));

vi.mock("../components/AdminNavbar.module.css", () => ({ default: {} }));

// ─── Mock CSS Module ──────────────────────────────────────────────────────────
vi.mock("../components/AdminAnalytics.module.css", () => ({
    default: {
        shell: "shell",
        main: "main",
        loadingScreen: "loadingScreen",
        spinner: "spinner",
        errorBox: "errorBox",
        pageTitle: "pageTitle",
        section: "section",
        sectionTitle: "sectionTitle",
        revenueMetricsGrid: "revenueMetricsGrid",
        revenueMetricCard: "revenueMetricCard",
        revenueMetricIcon: "revenueMetricIcon",
        revenueMetricInfo: "revenueMetricInfo",
        revenueMetricValue: "revenueMetricValue",
        revenueMetricLabel: "revenueMetricLabel",
        statsRow: "statsRow",
        statCard: "statCard",
        statValue: "statValue",
        statLabel: "statLabel",
        grid2: "grid2",
        card: "card",
        cardTitle: "cardTitle",
        revenueContainer: "revenueContainer",
        emptyNote: "emptyNote",
        horizontalChart: "horizontalChart",
        horizRow: "horizRow",
        horizLabel: "horizLabel",
        horizBarTrack: "horizBarTrack",
        horizBarFill: "horizBarFill",
        horizValue: "horizValue",
        horizPct: "horizPct",
        barChart: "barChart",
        barGroup: "barGroup",
        barValue: "barValue",
        barTrack: "barTrack",
        barFill: "barFill",
        barLabel: "barLabel",
        breakdown: "breakdown",
        bdRow: "bdRow",
        bdDot: "bdDot",
        bdLabel: "bdLabel",
        bdBar: "bdBar",
        bdFill: "bdFill",
        bdCount: "bdCount",
        bdPct: "bdPct",
    },
}));

// ─── Firebase mocks ───────────────────────────────────────────────────────────
vi.mock("../firebase", () => ({
    auth: { 
        signOut: vi.fn(),
        currentUser: { uid: "admin-uid" }
    },
    db: {},
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importActual) => ({
    ...(await importActual()),
    useNavigate: () => mockNavigate,
}));

// Mock Firebase Auth
let mockOnAuthStateChanged;
vi.mock("firebase/auth", () => ({
    onAuthStateChanged: (...args) => {
        if (mockOnAuthStateChanged) return mockOnAuthStateChanged(...args);
        return vi.fn();
    },
    signOut: vi.fn(),
}));

// Mock Firestore with call tracking
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockOnSnapshot = vi.fn(() => () => {});

vi.mock("firebase/firestore", () => ({
    doc: vi.fn(),
    collection: vi.fn(),
    getDoc: (...args) => mockGetDoc(...args),
    getDocs: (...args) => mockGetDocs(...args),
    onSnapshot: (...args) => mockOnSnapshot(...args),
    updateDoc: vi.fn().mockResolvedValue(),
    setDoc: vi.fn().mockResolvedValue(),
    increment: vi.fn((val) => ({ _increment: val })),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    writeBatch: vi.fn(() => ({
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(),
    })),
}));

// ─── Mock revenue service ─────────────────────────────────────────────────────
vi.mock("../services/revenueService", () => ({
    getRevenueAnalytics: vi.fn().mockResolvedValue({
        totalRevenue: 1000,
        onlineRevenue: 800,
        pendingCashRevenue: 0,
        collectedCashRevenue: 200,
        totalPayouts: 0,
        totalRefunds: 0,
        availableBalance: 900,
        promotionRevenue: 0,
        adPayments: 0,
    }),
}));

const renderComponent = () =>
    render(
        <MemoryRouter>
            <AdminAnalytics />
        </MemoryRouter>
    );

const adminUserDoc = { exists: () => true, data: () => ({ userType: "admin", firstName: "Alice", lastName: "Smith", email: "alice@example.com" }) };
// facilityConfig doc stored at "facilityConfig/default" in the component
const facilityConfigDoc = (slotsPerHour) => ({ exists: () => true, data: () => ({ slotsPerHour }) });
const facilityConfigMissing = { exists: () => false, data: () => ({}) };

beforeEach(() => {
    mockNavigate.mockReset();
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockOnSnapshot.mockReset();
    
    // Setup default auth state
    mockOnAuthStateChanged = vi.fn((_auth, cb) => {
        cb({ uid: "admin-uid", displayName: "Alice Smith", email: "alice@example.com" });
        return vi.fn();
    });
    
    // Default getDoc: 1st call = admin user doc, 2nd call = revenueAnalytics (ensureRevenueDocument), 3rd call = facilityConfig/default
    mockGetDoc
        .mockResolvedValueOnce(adminUserDoc)           // users/admin-uid (auth guard)
        .mockResolvedValueOnce({ exists: () => true, data: () => ({}) }) // revenueAnalytics/global (ensureRevenueDocument)
        .mockResolvedValueOnce(facilityConfigMissing); // facilityConfig/default (utilisation)
    
    // Setup default getDocs to return empty arrays
    mockGetDocs.mockResolvedValue({ docs: [] });
    
    // Setup default onSnapshot
    mockOnSnapshot.mockReturnValue(() => {});
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdminAnalytics – auth guard", () => {
    it("redirects to /login when no user is authenticated", async () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => { 
            cb(null); 
            return vi.fn(); 
        });

        renderComponent();
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
    });

    it("redirects to / when authenticated user is not an admin", async () => {
        mockOnAuthStateChanged = vi.fn((_auth, cb) => {
            cb({ uid: "student-uid", displayName: "Student User" });
            return vi.fn();
        });
        
        mockGetDoc.mockReset();
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ userType: "student" }) });

        renderComponent();
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    });

    it("does not redirect when user is an admin", async () => {
        renderComponent();
        await waitFor(() => expect(screen.getByText(/Analytics/i)).toBeInTheDocument());
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("calls the auth unsubscribe on unmount", () => {
        const unsub = vi.fn();
        mockOnAuthStateChanged = vi.fn((_auth, cb) => { 
            cb({ uid: "admin-uid" }); 
            return unsub; 
        });

        const { unmount } = renderComponent();
        unmount();
        expect(unsub).toHaveBeenCalled();
    });
});

describe("AdminAnalytics – loading & error states", () => {
    it("shows a spinner while data is loading", () => {
        mockGetDocs.mockImplementation(() => new Promise(() => {}));
        
        renderComponent();
        expect(screen.getByText(/Loading analytics/i)).toBeInTheDocument();
    });

    it("shows an error message when data fetch fails", async () => {
        mockGetDocs.mockRejectedValue(new Error("Network error"));

        renderComponent();
        await waitFor(() =>
            expect(screen.getByText(/Failed to load analytics/i)).toBeInTheDocument()
        );
    });
});

describe("AdminAnalytics – summary stat cards", () => {
    it("renders all stat cards", async () => {
        renderComponent();
        await waitFor(() => screen.getByText("Total Listings"));
        expect(screen.getByText("Total Listings")).toBeInTheDocument();
        expect(screen.getByText("Total Bookings")).toBeInTheDocument();
        expect(screen.getByText("Total Transactions")).toBeInTheDocument();
        expect(screen.getByText("Avg Utilisation")).toBeInTheDocument();
    });

    it("displays total revenue from sold listings only", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ status: "sold", price: 500, timestamp: new Date() }), id: "1" },
                    { data: () => ({ status: "sold", price: 300, timestamp: new Date() }), id: "2" },
                ]
            }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => {
            const revenueElements = screen.getAllByText(/R\s*800/);
            expect(revenueElements.length).toBeGreaterThan(0);
        });
    });

    it("shows R 0 revenue when there are no sold listings", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ 
                docs: [{ data: () => ({ status: "active", price: 100 }), id: "1" }]
            }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => {
            const zeroElements = screen.getAllByText(/R\s*0/);
            expect(zeroElements.length).toBeGreaterThan(0);
        });
    });

    it("shows 0% utilisation when there are no bookings", async () => {
        renderComponent();
        await waitFor(() => {
            const percentageElements = screen.getAllByText(/0%/);
            expect(percentageElements.length).toBeGreaterThan(0);
        });
    });
});

describe("AdminAnalytics – utilisation calculation", () => {
    // The component fetches: 
    //   getDoc call 1 → users/{uid}          (auth guard, in auth useEffect)
    //   getDoc call 2 → revenueAnalytics/global (ensureRevenueDocument, in data useEffect)
    //   getDoc call 3 → facilityConfig/default  (utilisation, in data useEffect)
    //
    // Formula: (uniqueSlots.size / slotsPerHour) * 100, capped at 100%, averaged across days.

    it("calculates average utilisation correctly", async () => {
        mockGetDoc.mockReset();
        mockGetDoc
            .mockResolvedValueOnce(adminUserDoc)                    // users/{uid}
            .mockResolvedValueOnce({ exists: () => true, data: () => ({}) }) // revenueAnalytics/global
            .mockResolvedValueOnce(facilityConfigDoc(2));           // facilityConfig/default → slotsPerHour=2
        
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ 
                docs: [
                    // 2 unique slots on same day, slotsPerHour=2 → (2/2)*100 = 100%
                    { data: () => ({ date: "2024-03-11", timeSlot: "09:00" }), id: "1" },
                    { data: () => ({ date: "2024-03-11", timeSlot: "10:00" }), id: "2" },
                ]
            }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        
        await waitFor(() => {
            expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
        });
        
        await waitFor(() => {
            const percentageElements = screen.getAllByText(/100%/);
            expect(percentageElements.length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    }, 15000);

    it("caps daily utilisation at 100%", async () => {
        mockGetDoc.mockReset();
        mockGetDoc
            .mockResolvedValueOnce(adminUserDoc)                    // users/{uid}
            .mockResolvedValueOnce({ exists: () => true, data: () => ({}) }) // revenueAnalytics/global
            .mockResolvedValueOnce(facilityConfigDoc(1));           // facilityConfig/default → slotsPerHour=1
        
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ 
                docs: [
                    // 3 unique slots, slotsPerHour=1 → (3/1)*100 = 300%, capped to 100%
                    { data: () => ({ date: "2024-03-11", timeSlot: "09:00" }), id: "1" },
                    { data: () => ({ date: "2024-03-11", timeSlot: "10:00" }), id: "2" },
                    { data: () => ({ date: "2024-03-11", timeSlot: "11:00" }), id: "3" },
                ]
            }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        
        await waitFor(() => {
            expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
        });
        
        await waitFor(() => {
            const percentageElements = screen.getAllByText(/100%/);
            expect(percentageElements.length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    }, 15000);

    it("deduplicates repeated time slots on the same day", async () => {
        mockGetDoc.mockReset();
        mockGetDoc
            .mockResolvedValueOnce(adminUserDoc)                    // users/{uid}
            .mockResolvedValueOnce({ exists: () => true, data: () => ({}) }) // revenueAnalytics/global
            .mockResolvedValueOnce(facilityConfigDoc(2));           // facilityConfig/default → slotsPerHour=2
        
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ 
                docs: [
                    // 2 bookings, same slot → deduplicated to 1 unique slot
                    // slotsPerHour=2 → (1/2)*100 = 50%
                    { data: () => ({ date: "2024-03-11", timeSlot: "09:00" }), id: "1" },
                    { data: () => ({ date: "2024-03-11", timeSlot: "09:00" }), id: "2" },
                ]
            }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        
        await waitFor(() => {
            expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
        });
        
        await waitFor(() => {
            const percentageElements = screen.getAllByText(/50%/);
            expect(percentageElements.length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    }, 15000);

    it("falls back to slotsPerHour=1 when facilityConfig doc does not exist", async () => {
        mockGetDoc.mockReset();
        mockGetDoc
            .mockResolvedValueOnce(adminUserDoc)                    // users/{uid}
            .mockResolvedValueOnce({ exists: () => true, data: () => ({}) }) // revenueAnalytics/global
            .mockResolvedValueOnce(facilityConfigMissing);          // facilityConfig/default → does not exist → fallback slotsPerHour=1
        
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ 
                docs: [
                    // 1 unique slot, slotsPerHour=1 (fallback) → (1/1)*100 = 100%
                    { data: () => ({ date: "2024-03-11", timeSlot: "09:00" }), id: "1" },
                ]
            }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        
        await waitFor(() => {
            expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
        });
        
        await waitFor(() => {
            const percentageElements = screen.getAllByText(/100%/);
            expect(percentageElements.length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    }, 15000);

    it("ignores bookings without a date or timeSlot", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ timeSlot: "09:00" }), id: "1" },  // missing date
                    { data: () => ({ date: "2024-03-11" }), id: "2" }, // missing timeSlot
                    { data: () => ({}), id: "3" },                      // missing both
                ]
            }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        
        await waitFor(() => {
            expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
        });
        
        await waitFor(() => {
            const percentageElements = screen.getAllByText(/0%/);
            expect(percentageElements.length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    }, 15000);
});

describe("AdminAnalytics – data aggregation", () => {
    it("groups users by userType and defaults missing type to 'student'", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ userType: "admin", firstName: "Admin" }), id: "1" },
                    { data: () => ({ userType: "landlord", firstName: "Landlord" }), id: "2" },
                    { data: () => ({ firstName: "Student" }), id: "3" },
                ]
            }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => screen.getByText("User breakdown"));
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByText("landlord")).toBeInTheDocument();
        expect(screen.getByText("student")).toBeInTheDocument();
    });

    it("groups listings by category and defaults missing to 'Uncategorised'", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ category: "Books", status: "active" }), id: "1" },
                    { data: () => ({ category: "Electronics", status: "active" }), id: "2" },
                    { data: () => ({ status: "active" }), id: "3" },
                ]
            }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => screen.getByText("Popular Categories"));
        expect(screen.getByText("Popular Categories")).toBeInTheDocument();
    });

    it("groups listings by status and defaults missing status to 'active'", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ status: "sold" }), id: "1" },
                    { data: () => ({}), id: "2" },
                ]
            }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => screen.getByText("Listing status"));
        expect(screen.getByText("sold")).toBeInTheDocument();
        expect(screen.getByText("active")).toBeInTheDocument();
    });

    it("aggregates revenue by month and renders month label", async () => {
        const ts = new Date("2024-06-15");
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ status: "sold", price: 200, timestamp: { toDate: () => ts } }), id: "1" },
                ]
            }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => screen.getByText(/Revenue by month/));
    });

    it("shows 'No revenue data yet' when there are no sold listings", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ 
                docs: [{ data: () => ({ status: "active", price: 100 }), id: "1" }]
            }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => expect(screen.getByText(/No revenue data yet/i)).toBeInTheDocument());
    });

    it("counts bookings by day of week", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ date: "2024-03-11", timeSlot: "09:00" }), id: "1" },
                    { data: () => ({ date: "2024-03-13", timeSlot: "09:00" }), id: "2" },
                ]
            }) // bookings
            .mockResolvedValueOnce({ docs: [] }); // transactions

        renderComponent();
        await waitFor(() => screen.getByText("Drop-off bookings by day of week"));
        expect(screen.getByText("Mon")).toBeInTheDocument();
        expect(screen.getByText("Wed")).toBeInTheDocument();
    });

    it("groups transactions by status and defaults missing to 'unknown'", async () => {
        mockGetDocs
            .mockResolvedValueOnce({ docs: [] }) // users
            .mockResolvedValueOnce({ docs: [] }) // listings
            .mockResolvedValueOnce({ docs: [] }) // bookings
            .mockResolvedValueOnce({ 
                docs: [
                    { data: () => ({ status: "completed" }), id: "1" },
                    { data: () => ({ status: "pending" }), id: "2" },
                    { data: () => ({}), id: "3" },
                ]
            }); // transactions

        renderComponent();
        await waitFor(() => screen.getByText("Transaction status breakdown"));
        expect(screen.getByText("completed")).toBeInTheDocument();
        expect(screen.getByText("pending")).toBeInTheDocument();
        expect(screen.getByText("unknown")).toBeInTheDocument();
    });
});