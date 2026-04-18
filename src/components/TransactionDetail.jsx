import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { updateTransactionStatus } from '../services/notificationService';

export default function TransactionDetail() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTransaction() {
      const docRef = doc(db, 'transactions', transactionId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setTransaction({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    }
    fetchTransaction();
  }, [transactionId]);

  const handleAction = async (status) => {
    await updateTransactionStatus(transactionId, status);
    alert(`Offer ${status}!`);
    navigate('/profile'); // Send them back to profile after action
  };

  if (loading) return <div>Loading offer details...</div>;
  if (!transaction) return <div>Offer not found.</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Review Offer</h1>
      <p><strong>Transaction ID:</strong> {transaction.id}</p>
      <p><strong>Buyer ID:</strong> {transaction.buyerId}</p>
      <p><strong>Listing ID:</strong> {transaction.listingId}</p>
      
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => handleAction('accepted')}
          style={{ backgroundColor: 'green', color: 'white', padding: '10px' }}
        >
          Accept Offer
        </button>
        <button 
          onClick={() => handleAction('declined')}
          style={{ backgroundColor: 'red', color: 'white', padding: '10px' }}
        >
          Decline Offer
        </button>
      </div>
    </div>
  );
}