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
  
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [availableSlots, setAvailableSlots] = useState(TIME_SLOTS);
  const [minDate, setMinDate] = useState("");
  
  // Check auth
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log("Auth user:", user?.email);
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);
  
  // Set min date
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setMinDate(tomorrow.toISOString().split("T")[0]);
  }, []);
  
  // Fetch transaction when user is loaded
  useEffect(() => {
    if (currentUser && transactionId) {
      fetchTransaction();
    } else if (currentUser === null && !loading) {
      setError("Please log in to book a drop-off");
      setLoading(false);
    }
  }, [currentUser, transactionId]);
  
  // Check available slots when date changes
  useEffect(() => {
    if (selectedDate) {
      checkAvailableSlots(selectedDate);
    }
  }, [selectedDate]);
  
  async function fetchTransaction() {
    setLoading(true);
    setError("");
    
    try {
      console.log("Fetching transaction:", transactionId);
      
      const transactionRef = doc(db, "transactions", transactionId);
      const transactionSnap = await getDoc(transactionRef);
      
      if (!transactionSnap.exists()) {
        setError("Transaction not found");
        setLoading(false);
        return;
      }
      
      const transactionData = { id: transactionSnap.id, ...transactionSnap.data() };
      console.log("Transaction data:", transactionData);
      
      // Check if user is the seller
      if (transactionData.sellerId !== currentUser.uid) {
        setError("You can only book drop-off for your own sales");
        setLoading(false);
        return;
      }
      
      // Check status
      if (transactionData.status !== "accepted") {
        setError("Transaction status is: " + transactionData.status + ". Must be 'accepted' to book drop-off.");
        setLoading(false);
        return;
      }
      
      setTransaction(transactionData);
      
      // Get listing
      const listingRef = doc(db, "listings", transactionData.listingId);
      const listingSnap = await getDoc(listingRef);
      if (listingSnap.exists()) {
        setListing({ id: listingSnap.id, ...listingSnap.data() });
      }
      
      // Get buyer name
      const buyerRef = doc(db, "users", transactionData.buyerId);
      const buyerSnap = await getDoc(buyerRef);
      if (buyerSnap.exists()) {
        const buyerData = buyerSnap.data();
        setBuyerName(buyerData.displayName || buyerData.name || "Buyer");
      }
      
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to load transaction: " + err.message);
    } finally {
      setLoading(false);
    }
  }
  
  async function checkAvailableSlots(date) {
    try {
      const bookingsRef = collection(db, "bookings");
      const q = query(bookingsRef, where("date", "==", date));
      const querySnapshot = await getDocs(q);
      
      const bookedSlots = querySnapshot.docs.map(doc => doc.data().timeSlot);
      const available = TIME_SLOTS.filter(slot => !bookedSlots.includes(slot));
      setAvailableSlots(available);
      
      if (selectedTimeSlot && !available.includes(selectedTimeSlot)) {
        setSelectedTimeSlot("");
      }
    } catch (err) {
      console.error("Error checking slots:", err);
    }
  }
  
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
      // Create booking
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
      
      // Update transaction
      const transactionRef = doc(db, "transactions", transaction.id);
      await updateDoc(transactionRef, {
        bookingId: docRef.id,
        dropOffStatus: "scheduled",
        dropOffDate: selectedDate,
        dropOffTimeSlot: selectedTimeSlot,
      });

            // Create a notification for the seller
      await addDoc(collection(db, "notifications"), {
        userId: transaction.sellerId,
        title: "Drop-off Booked",
        message: `Your drop-off for ${listing.title} is scheduled on ${selectedDate} at ${selectedTimeSlot}.`,
        read: false,
        createdAt: serverTimestamp(),
      });
      
      alert("Drop-off booked successfully!");
      navigate("/trade-facility");
      
    } catch (err) {
      console.error("Error booking:", err);
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
          <button onClick={() => navigate("/trade-facility")}>Back to Trade Facility</button>
        </div>
      </>
    );
  }
  
  return (
    <>
      <NavBar />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px" }}>
        <h1>Accept Offer & Book Drop-Off</h1>
        <p>Accept {buyerName}'s offer and schedule when you'll drop off the item.</p>
        
        <div style={{
          backgroundColor: "#f5f5f5",
          padding: "16px",
          borderRadius: "12px",
          marginBottom: "24px"
        }}>
          <p><strong>Buyer:</strong> {buyerName}</p>
          <p><strong>Item:</strong> {listing?.title || "Loading..."}</p>
          <p><strong>Price:</strong> R{listing?.price || "0"}</p>
          <p><strong>Status:</strong> {transaction?.status}</p>
        </div>
        
        <div style={{
          backgroundColor: "#e8f5e9",
          padding: "16px",
          borderRadius: "12px",
          marginBottom: "24px",
          border: "1px solid #4caf50"
        }}>
          <p> The buyer has paid R{listing?.price || "0"} online.</p>
        </div>
        
        <label>Select Drop-off Date</label>
        <input
          type="date"
          style={{ width: "100%", padding: "10px", marginBottom: "20px" }}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          min={minDate}
          required
        />
        
        <label>Select Time Slot</label>
        <select
          style={{ width: "100%", padding: "10px", marginBottom: "20px" }}
          value={selectedTimeSlot}
          onChange={(e) => setSelectedTimeSlot(e.target.value)}
          required
          disabled={!selectedDate}
        >
          <option value="">Select a time slot</option>
          {availableSlots.map((slot) => (
            <option key={slot} value={slot}>{slot}</option>
          ))}
        </select>
        
        {selectedDate && availableSlots.length === 0 && (
          <p style={{ color: "red" }}>No available slots for this date.</p>
        )}
        
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="button"
            onClick={() => navigate("/trade-facility")}
            style={{ padding: "12px 24px", backgroundColor: "#6c757d", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedDate || !selectedTimeSlot}
            style={{ padding: "12px 24px", backgroundColor: "#27ae60", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}
          >
            {submitting ? "Booking..." : "Accept & Book Drop-off"}
          </button>
        </div>
      </div>
    </>
  );
}