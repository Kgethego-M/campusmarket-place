// src/components/ReviewOffer.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { notifyOfferAccepted, notifyOfferDeclined } from '../services/notificationService';

export default function ReviewOffer() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch the transaction details so you can see WHAT you are accepting
  useEffect(() => {
    async function fetchDetails() {
      try {
        const docRef = doc(db, "transactions", transactionId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setTransaction({ id: snap.id, ...snap.data() });
        } else {
          console.error("Transaction not found");
        }
      } catch (error) {
        console.error("Error fetching transaction:", error);
      }
    }
    fetchDetails();
  }, [transactionId]);

  const handleDecision = async (status) => {
    setLoading(true);
    try {
      // 1. Update the transaction status in Firestore
      const transactionRef = doc(db, "transactions", transactionId);
      await updateDoc(transactionRef, { 
        status: status, // 'accepted' or 'declined'
        updatedAt: new Date() 
      });

      // 2. If accepted, notify the buyer using the correct function
      if (status === 'accepted' && transaction) {
        // Fetch listing details to get listing title if not already in transaction
        let listingTitle = transaction.listingTitle;
        let listingId = transaction.listingId;
        
        if (!listingTitle && listingId) {
          try {
            const listingRef = doc(db, "listings", listingId);
            const listingSnap = await getDoc(listingRef);
            if (listingSnap.exists()) {
              listingTitle = listingSnap.data().title;
            }
          } catch (err) {
            console.error("Error fetching listing:", err);
          }
        }
        
        await notifyOfferAccepted({
          transactionId: transactionId,
          buyerId: transaction.buyerId,
          sellerId: transaction.sellerId,
          listingId: listingId,
          listingTitle: listingTitle || 'your item',
          agreedPrice: transaction.agreedPrice || 0,
        });
        alert(`Offer accepted! The buyer has been notified.`);
      } else if (status === 'declined' && transaction) {
        // Notify buyer that offer was declined
        await notifyOfferDeclined({
          transactionId: transactionId,
          buyerId: transaction.buyerId,
          listingId: transaction.listingId,
          listingTitle: transaction.listingTitle || 'your item',
        });
        alert(`Offer declined.`);
      }
      
      // 3. Send the user back to their listings or dashboard
      navigate('/view-listing'); 
    } catch (error) {
      console.error("Error updating transaction:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '100px', textAlign: 'center' }}>
      <h1>Review Offer Page</h1>
      <p>Transaction ID: {transactionId}</p>
      
      {transaction && (
        <div style={{ marginBottom: '20px', border: '1px solid #ddd', padding: '10px', borderRadius: '8px' }}>
          <p><strong>Item:</strong> {transaction.listingTitle || transaction.listingId || 'Unknown item'}</p>
          <p><strong>Buyer:</strong> {transaction.buyerName || transaction.buyerId || 'Unknown buyer'}</p>
          <p><strong>Offer Amount:</strong> R{transaction.agreedPrice || '0'}</p>
          <p><strong>Payment Type:</strong> {transaction.paymentType || 'Cash'}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
        <button 
          onClick={() => handleDecision('accepted')}
          disabled={loading}
          style={{ 
            background: loading ? '#ccc' : 'green', 
            color: 'white', 
            padding: '10px 20px', 
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px'
          }}
        >
          {loading ? 'Processing...' : 'Accept'}
        </button>
        <button 
          onClick={() => handleDecision('declined')}
          disabled={loading}
          style={{ 
            background: loading ? '#ccc' : 'red', 
            color: 'white', 
            padding: '10px 20px', 
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px'
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}