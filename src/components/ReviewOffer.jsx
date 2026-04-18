import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { notifyBuyerOfAcceptance } from '../services/notificationService';

export default function ReviewOffer() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState(null);

  // Optional: Fetch the transaction details so you can see WHAT you are accepting
  useEffect(() => {
    async function fetchDetails() {
      const docRef = doc(db, "transactions", transactionId);
      const snap = await getDoc(docRef);
      if (snap.exists()) setTransaction(snap.data());
    }
    fetchDetails();
  }, [transactionId]);

  const handleDecision = async (status) => {
    try {
      // 1. Update the transaction status in Firestore
      const transactionRef = doc(db, "transactions", transactionId);
      await updateDoc(transactionRef, { 
        status: status, // 'accepted' or 'declined'
        updatedAt: new Date() 
      });

      // 2. If accepted, notify the buyer
      if (status === 'accepted' && transaction) {
        await notifyBuyerOfAcceptance({
          transactionId: transactionId,
          buyerId: transaction.buyerId
        });
      }

      alert(`Offer ${status}!`);
      
      // 3. Send the user back to their listings or dashboard
      navigate('/view-listing'); 
    } catch (error) {
      console.error("Error updating transaction:", error);
      alert("Something went wrong.");
    }
  };

  return (
    <div style={{ padding: '100px', textAlign: 'center' }}>
      <h1>Review Offer Page</h1>
      <p>Transaction ID: {transactionId}</p>
      
      {transaction && (
        <div style={{ marginBottom: '20px', border: '1px solid #ddd', padding: '10px' }}>
          <p><strong>Item:</strong> {transaction.listingId}</p>
          <p><strong>Buyer ID:</strong> {transaction.buyerId}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
        <button 
          onClick={() => handleDecision('accepted')}
          style={{ background: 'green', color: 'white', padding: '10px 20px', cursor: 'pointer' }}
        >
          Accept
        </button>
        <button 
          onClick={() => handleDecision('declined')}
          style={{ background: 'red', color: 'white', padding: '10px 20px', cursor: 'pointer' }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}