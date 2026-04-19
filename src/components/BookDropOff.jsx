import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, auth } from "../firebase.js";
import { doc, getDoc, addDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import NavBar from "./NavBarTemp.jsx";

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
  const [paymentMethod, setPaymentMethod] = useState(null);

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState(TIME_SLOTS);
  const [minDate, setMinDate] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinDate(tomorrow.toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    if (currentUser && transactionId) fetchTransaction();
    else if (currentUser === null && !loading) setError("Please log in to book a drop-off");
  }, [currentUser, transactionId]);

  useEffect(() => {
    if (selectedDate) checkAvailableSlots(selectedDate);
  }, [selectedDate]);

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

      if (transactionData.sellerId !== currentUser.uid) {
        setError("You can only book drop-off for your own sales");
        setLoading(false);
        return;
      }
      if (transactionData.status !== "accepted") {
        setError(`Transaction must be accepted. Current status: ${transactionData.status}`);
        setLoading(false);
        return;
      }
      if (transactionData.bookingId) {
        setError("A drop-off has already been booked for this transaction.");
        setLoading(false);
        return;
      }

      setTransaction(transactionData);

      // Derive payment method from paymentMethod or paymentType
      let pm = transactionData.paymentMethod;
      if (!pm && transactionData.paymentType) {
        if (transactionData.paymentType === 'full_online') pm = 'online';
        else if (transactionData.paymentType === 'cash') pm = 'cod';
        else if (transactionData.paymentType === 'partial') pm = 'partial';
      }
      setPaymentMethod(pm || 'unknown');

      const listingSnap = await getDoc(doc(db, "listings", transactionData.listingId));
      if (listingSnap.exists()) setListing({ id: listingSnap.id, ...listingSnap.data() });

      const buyerSnap = await getDoc(doc(db, "users", transactionData.buyerId));
      if (buyerSnap.exists()) {
        const buyer = buyerSnap.data();
        setBuyerName(buyer.displayName || buyer.name || buyer.firstName || "Buyer");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkAvailableSlots(date) {
    try {
      const q = query(collection(db, "bookings"), where("date", "==", date));
      const snapshot = await getDocs(q);
      const booked = snapshot.docs.map(d => d.data().timeSlot);
      const available = TIME_SLOTS.filter(slot => !booked.includes(slot));
      setAvailableSlots(available);
      if (selectedTimeSlot && !available.includes(selectedTimeSlot)) setSelectedTimeSlot("");
    } catch (err) {
      console.error("Error checking slots:", err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedDate) return setError("Please select a date");
    if (!selectedTimeSlot) return setError("Please select a time slot");

    setSubmitting(true);
    setError("");

    try {
      const latestSnap = await getDoc(doc(db, "transactions", transaction.id));
      if (latestSnap.data().bookingId) {
        setError("This transaction has already been booked by someone else.");
        setSubmitting(false);
        return;
      }

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
      const bookingRef = await addDoc(collection(db, "bookings"), bookingData);

      await updateDoc(doc(db, "transactions", transaction.id), {
        bookingId: bookingRef.id,
        dropOffStatus: "scheduled",
        dropOffDate: selectedDate,
        dropOffTimeSlot: selectedTimeSlot,
      });

      await addDoc(collection(db, "notifications"), {
        userId: transaction.sellerId,
        title: "Drop-off Booked",
        message: `Your drop-off for ${listing?.title} is scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      navigate("/trade-facility");
    } catch (err) {
      console.error(err);
      setError("Failed to book: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const getPaymentMessage = () => {
    const price = listing?.price || "0";
    switch (paymentMethod) {
      case "online": return `✅ The buyer has paid R${price} online.`;
      case "cod": return `💰 The buyer will pay R${price} cash on delivery.`;
      case "partial": return `💳 The buyer will pay partially online and partially cash on delivery. Please confirm details with the buyer.`;
      default: return `💵 Transaction amount: R${price}. Please confirm payment method with the buyer before proceeding.`;
    }
  };

  if (loading) return <><NavBar /><div style={{ padding: "40px", textAlign: "center" }}>Loading transaction details...</div></>;
  if (error) return (
    <>
      <NavBar />
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h1>Book Drop-Off</h1>
        <p style={{ color: "red" }}>{error}</p>
        <button onClick={() => navigate("/trade-facility")} style={{ padding: "10px 20px", marginTop: "16px", backgroundColor: "#4a90d9", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>Back to Trade Facility</button>
      </div>
    </>
  );

  return (
    <>
      <NavBar />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 20px", fontFamily: "'Segoe UI', sans-serif" }}>
        <h1 style={{ fontSize: "26px", fontWeight: "700", marginBottom: "6px" }}>Accept Offer & Book Drop-Off</h1>
        <p style={{ color: "#666", marginBottom: "24px" }}>Accept {buyerName}'s offer and schedule when you'll drop off the item.</p>

        <div style={{ backgroundColor: "#f8f9fa", padding: "16px", borderRadius: "12px", marginBottom: "20px", border: "1px solid #e0e0e0" }}>
          <p><strong>Buyer:</strong> {buyerName}</p>
          <p><strong>Item:</strong> {listing?.title || "Loading..."}</p>
          <p><strong>Price:</strong> R{listing?.price || "0"}</p>
          <p><strong>Status:</strong> {transaction?.status}</p>
          <p><strong>Payment method:</strong> {paymentMethod}</p>
        </div>

        <div style={{ backgroundColor: "#e8f5e9", padding: "14px 16px", borderRadius: "12px", marginBottom: "24px", border: "1px solid #4caf50", color: "#2d6a4f" }}>
          {getPaymentMessage()}
          <br /><small>Please confirm this is correct before proceeding.</small>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <label style={{ fontWeight: "600", display: "block", marginBottom: "6px" }}>Select Drop-off Date</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} min={minDate} required style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #ccd6e0", fontSize: "14px", boxSizing: "border-box" }} />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label style={{ fontWeight: "600", display: "block", marginBottom: "6px" }}>Select Time Slot</label>
          <select value={selectedTimeSlot} onChange={(e) => setSelectedTimeSlot(e.target.value)} disabled={!selectedDate} required style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #ccd6e0", fontSize: "14px", backgroundColor: "white", boxSizing: "border-box" }}>
            <option value="">Select a time slot</option>
            {availableSlots.map(slot => <option key={slot} value={slot}>{slot}</option>)}
          </select>
          {selectedDate && availableSlots.length === 0 && <p style={{ color: "red", marginTop: "6px", fontSize: "13px" }}>No available slots for this date. Please choose another date.</p>}
        </div>

        {error && <div style={{ backgroundColor: "#fdecea", border: "1px solid #f5c6c6", borderRadius: "8px", padding: "12px", marginBottom: "16px", color: "#c0392b", fontSize: "14px" }}>⚠️ {error}</div>}

        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={() => navigate("/trade-facility")} style={{ flex: 1, padding: "12px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting || !selectedDate || !selectedTimeSlot} style={{ flex: 2, padding: "12px", backgroundColor: submitting ? "#aaa" : "#27ae60", color: "white", border: "none", borderRadius: "8px", cursor: submitting ? "not-allowed" : "pointer", fontWeight: "600" }}>{submitting ? "Booking..." : "Accept & Book Drop-off"}</button>
        </div>
      </div>
    </>
  );
}