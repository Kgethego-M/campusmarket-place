import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;

// Must match DB enum exactly: sell, trade, either
const listingTypeMap = {
  sale: "sell",
  trade: "trade",
  either: "either",
};

// Must match DB enum exactly: new, like_new, good, fair
const conditionMap = {
  'New': 'new',
  'Like New': 'like_new',
  'Good': 'good',
  'Fair': 'fair',
};

function CreateListingAzure() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [specifications, setSpecifications] = useState('');
  const [condition, setCondition] = useState('');
  const [category, setCategory] = useState('');
  const [listingType, setListingType] = useState('');
  const [userId, setUserId] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB');
      return;
    }

    setError('');
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!listingTypeMap[listingType]) throw new Error("Please select a valid listing type");
      if (!userId.trim()) throw new Error("User ID is required");
      if (!conditionMap[condition]) throw new Error("Please select a valid condition");

      const formData = new FormData();
      formData.append('user_id', userId.trim());
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('specifications', specifications.trim());
      formData.append('price', parseFloat(price));
      formData.append('category', category);
      formData.append('condition', conditionMap[condition]);
      formData.append('listing_type', listingTypeMap[listingType]);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await fetch(`${API_URL}/listings/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const result = await response.json();
      console.log('Listing created:', result);
      navigate('/azure/view-listing');

    } catch (err) {
      console.error('CreateListing error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>Create New Listing</h2>

      {error && (
        <p style={{ color: 'red', background: '#fff0f0', padding: '10px', borderRadius: '4px' }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        <input
          placeholder="Your User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
        />

        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="Price (R)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min="0"
          step="0.01"
          required
        />

        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <textarea
          placeholder="Specifications (optional)"
          value={specifications}
          onChange={(e) => setSpecifications(e.target.value)}
          rows={2}
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

        <select value={listingType} onChange={(e) => setListingType(e.target.value)} required>
          <option value="">Select</option>
          <option value="sale">For Sale</option>
          <option value="trade">For Trade</option>
          <option value="either">Either</option>
        </select>

        <div>
          <label style={{ display: 'block', marginBottom: '4px' }}>
            Product Image (optional, max 2MB)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
          />
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Preview"
              style={{
                marginTop: '8px',
                maxWidth: '100%',
                maxHeight: '200px',
                objectFit: 'contain',
                borderRadius: '4px',
                border: '1px solid #ddd'
              }}
            />
          )}
        </div>

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