import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, auth } from "../firebase.js";
import { doc, getDoc, addDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";

// Hardcoded time slots — will be managed by admin/Trade Facility Officer in future sprints
const TIME_SLOTS = [
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "12:00 - 13:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
];

export default function BookDropOff() {
  const { transactionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const [transaction, setTransaction] = useState(null);
  const [listing, setListing] = useState(null);
  const [buyerName, setBuyerName] = useState("");

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState(TIME_SLOTS);
  const [minDate, setMinDate] = useState("");

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Set minimum date to tomorrow — cannot book same day
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  // Fetch transaction once user is authenticated
  useEffect(() => {
    if (currentUser && transactionId) {
      fetchTransaction();
    } else if (currentUser === null && !loading) {
      setError("Please log in to book a drop-off");
      setLoading(false);
    }
  }, [currentUser, transactionId]);

  // Re-check available slots whenever date changes
  useEffect(() => {
    if (selectedDate) {
      checkAvailableSlots(selectedDate);
    }
  }, [selectedDate]);

  // Fetches the transaction from Firestore and verifies the current user is the seller
  async function fetchTransaction() {
    setLoading(true);
    setError("");

    try {
      const transactionRef = doc(db, "transactions", transactionId);
      const transactionSnap = await getDoc(transactionRef);

      if (!transactionSnap.exists()) {
        setError("Transaction not found");
        setLoading(false);
        return;
      }

      const transactionData = { id: transactionSnap.id, ...transactionSnap.data() };

      // Only the seller can book a drop-off
      if (transactionData.sellerId !== currentUser.uid) {
        setError("You can only book drop-off for your own sales");
        setLoading(false);
        return;
      }

      // Transaction must be in accepted state
      if (transactionData.status !== "accepted") {
        setError("Transaction must be accepted before booking a drop-off. Current status: " + transactionData.status);
        setLoading(false);
        return;
      }

      // Prevent double-booking — check if booking already exists for this transaction
      if (transactionData.bookingId) {
        setError("A drop-off has already been booked for this transaction.");
        setLoading(false);
        return;
      }

      setTransaction(transactionData);

      // Get listing details
      const listingSnap = await getDoc(doc(db, "listings", transactionData.listingId));
      if (listingSnap.exists()) {
        setListing({ id: listingSnap.id, ...listingSnap.data() });
      }

      // Get buyer's display name
      const buyerSnap = await getDoc(doc(db, "users", transactionData.buyerId));
      if (buyerSnap.exists()) {
        const buyerData = buyerSnap.data();
        setBuyerName(buyerData.displayName || buyerData.name || "Buyer");
      }

    } catch (err) {
      console.error("Error fetching transaction:", err);
      setError("Failed to load transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Checks Firestore for already booked slots on the selected date and filters them out
  async function checkAvailableSlots(date) {
    try {
      const bookingsRef = collection(db, "bookings");
      const q = query(bookingsRef, where("date", "==", date));
      const querySnapshot = await getDocs(q);

      const bookedSlots = querySnapshot.docs.map(doc => doc.data().timeSlot);
      const available = TIME_SLOTS.filter(slot => !bookedSlots.includes(slot));
      setAvailableSlots(available);

      // Clear selected slot if it's no longer available
      if (selectedTimeSlot && !available.includes(selectedTimeSlot)) {
        setSelectedTimeSlot("");
      }
    } catch (err) {
      console.error("Error checking available slots:", err);
    }
  }

  // Creates the booking document in Firestore and updates the transaction status
  async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedDate) {
      setError("Please select a date");
      return;
    }
    if (!selectedTimeSlot) {
      setError("Please select a time slot");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Race condition check — re-fetch transaction to confirm it hasn't been booked since page loaded
      const latestSnap = await getDoc(doc(db, "transactions", transaction.id));
      const latestTransaction = latestSnap.data();

      if (latestTransaction.bookingId) {
        setError("This transaction has already been booked by someone else.");
        setSubmitting(false);
        return;
      }

      // Create booking document in Firestore
      const bookingData = {
        transactionId: transaction.id,
        listingId: transaction.listingId,
        sellerId: transaction.sellerId,
        buyerId: transaction.buyerId,
        date: selectedDate,
        timeSlot: selectedTimeSlot,
        status: "scheduled",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "bookings"), bookingData);

      // Update the transaction with booking details
      await updateDoc(doc(db, "transactions", transaction.id), {
        bookingId: docRef.id,
        dropOffStatus: "scheduled",
        dropOffDate: selectedDate,
        dropOffTimeSlot: selectedTimeSlot,
      });

      // Create in-app notification for the seller
      await addDoc(collection(db, "notifications"), {
        userId: transaction.sellerId,
        title: "Drop-off Booked",
        message: `Your drop-off for ${listing?.title} is scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      navigate("/trade-facility");

    } catch (err) {
      console.error("Error creating booking:", err);
      setError("Failed to book: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <div style={{ padding: "40px", textAlign: "center" }}>
          <p>Loading transaction details...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <NavBar />
        <div style={{ padding: "40px", textAlign: "center" }}>
          <h1>Book Drop-Off</h1>
          <p style={{ color: "red" }}>{error}</p>
          <button onClick={() => navigate("/trade-facility")}
            style={{ padding: "10px 20px", marginTop: "16px", backgroundColor: "#4a90d9", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
            Back to Trade Facility
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "'Segoe UI', sans-serif"
      }}>
        <h1 style={{ fontSize: "26px", fontWeight: "700", marginBottom: "6px" }}>
          Accept Offer & Book Drop-Off
        </h1>
        <p style={{ color: "#666", marginBottom: "24px" }}>
          Accept {buyerName}'s offer and schedule when you'll drop off the item.
        </p>

        {/* Transaction summary card */}
        <div style={{
          backgroundColor: "#f8f9fa",
          padding: "16px",
          borderRadius: "12px",
          marginBottom: "20px",
          border: "1px solid #e0e0e0"
        }}>
          <p style={{ margin: "4px 0" }}><strong>Buyer:</strong> {buyerName}</p>
          <p style={{ margin: "4px 0" }}><strong>Item:</strong> {listing?.title || "Loading..."}</p>
          <p style={{ margin: "4px 0" }}><strong>Price:</strong> R{listing?.price || "0"}</p>
          <p style={{ margin: "4px 0" }}><strong>Status:</strong> {transaction?.status}</p>
        </div>

        {/* Payment confirmation */}
        <div style={{
          backgroundColor: "#e8f5e9",
          padding: "14px 16px",
          borderRadius: "12px",
          marginBottom: "24px",
          border: "1px solid #4caf50",
          color: "#2d6a4f"
        }}>
           The buyer has paid R{listing?.price || "0"} online. Please confirm this amount is correct before proceeding.
        </div>

        {/* Date picker */}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ fontWeight: "600", display: "block", marginBottom: "6px" }}>
            Select Drop-off Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={minDate}
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #ccd6e0",
              fontSize: "14px",
              boxSizing: "border-box"
            }}
          />
        </div>

        {/* Time slot dropdown */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ fontWeight: "600", display: "block", marginBottom: "6px" }}>
            Select Time Slot
          </label>
          <select
            value={selectedTimeSlot}
            onChange={(e) => setSelectedTimeSlot(e.target.value)}
            disabled={!selectedDate}
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #ccd6e0",
              fontSize: "14px",
              backgroundColor: "white",
              boxSizing: "border-box"
            }}
          >
            <option value="">Select a time slot</option>
            {availableSlots.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>

          {selectedDate && availableSlots.length === 0 && (
            <p style={{ color: "red", marginTop: "6px", fontSize: "13px" }}>
              No available slots for this date. Please choose another date.
            </p>
          )}
        </div>

        {error && (
          <div style={{
            backgroundColor: "#fdecea",
            border: "1px solid #f5c6c6",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "16px",
            color: "#c0392b",
            fontSize: "14px"
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="button"
            onClick={() => navigate("/trade-facility")}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedDate || !selectedTimeSlot}
            style={{
              flex: 2,
              padding: "12px",
              backgroundColor: submitting ? "#aaa" : "#27ae60",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: "600"
            }}
          >
            {submitting ? "Booking..." : "Accept & Book Drop-off"}
          </button>
        </div>
      </div>
    </>
  );
}