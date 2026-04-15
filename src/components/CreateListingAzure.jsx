import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;

// 🔥 FIX: frontend → backend mapping (MUST match DB ENUM)
const listingTypeMap = {
  sale: "sell",
  trade: "rent",
  either: "free",
};

function CreateListingAzure() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState('');
  const [category, setCategory] = useState('');
  const [listingType, setListingType] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 🔥 validation (prevents useless API calls)
      if (!listingTypeMap[listingType]) {
        throw new Error("Please select a valid listing type");
      }

      const listingData = {
        title: title.trim(),
        price: parseFloat(price),
        description: description.trim(),
        condition,
        category,
        listing_type: listingTypeMap[listingType], // 🔥 FIXED HERE
      };

      console.log('Sending to API:', listingData);
      console.log('API URL:', API_URL);

      const response = await fetch(`${API_URL}/listings/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(listingData),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP ${response.status}: Failed to create listing`);
      }

      const data = await response.json();
      console.log('Created listing:', data);

      navigate('/azure/view-listing');

    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>Create New Listing (Azure)</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />

        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <select value={condition} onChange={(e) => setCondition(e.target.value)} required>
          <option value="">Select condition</option>
          <option value="New">New</option>
          <option value="Like New">Like New</option>
          <option value="Good">Good</option>
          <option value="Fair">Fair</option>
        </select>

        <select value={category} onChange={(e) => setCategory(e.target.value)} required>
          <option value="">Select category</option>
          <option value="Books">Books</option>
          <option value="Electronics">Electronics</option>
          <option value="Clothing">Clothing</option>
          <option value="Furniture">Furniture</option>
          <option value="Other">Other</option>
        </select>

        {/* 🔥 FIXED LISTING TYPE */}
        <select
          value={listingType}
          onChange={(e) => setListingType(e.target.value)}
          required
        >
          <option value="">Select listing type</option>
          <option value="sale">For Sale</option>
          <option value="trade">For Trade</option>
          <option value="either">Either</option>
        </select>

        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Listing'}
        </button>

        <button type="button" onClick={() => navigate('/azure/view-listing')}>
          Cancel
        </button>
      </form>
    </div>
  );
}

export default CreateListingAzure;