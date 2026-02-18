import { useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Upload, X, Star, Loader } from 'lucide-react';
import PlaceholderImage from './ui/PlaceholderImage';

import { API_BASE_URL } from '../config';

interface ProductImage {
  id: number;
  url: string;
  alt_text?: string;
  position: number;
  primary: boolean;
}

interface ImageUploadProps {
  productId: number;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
}

export default function ImageUpload({ productId, images, onImagesChange }: ImageUploadProps) {
  const { getToken } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadImage = async (file: File) => {
    try {
      setUploading(true);
      const token = await getToken();
      
      // Step 1: Upload file to S3
      const formData = new FormData();
      formData.append('file', file);
      
      const uploadResponse = await axios.post(
        `${API_BASE_URL}/api/v1/admin/uploads`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      
      const s3Key = uploadResponse.data.data.s3_key;
      
      // Step 2: Get current images count from backend (to avoid race conditions)
      const currentImagesResponse = await axios.get(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const currentImages = currentImagesResponse.data.data || currentImagesResponse.data;
      const nextPosition = currentImages.length;
      const shouldBePrimary = currentImages.length === 0;
      
      // Step 3: Create product image record with S3 key
      await axios.post(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images`,
        {
          product_image: {
            s3_key: s3Key,
            alt_text: file.name,
            position: nextPosition,
            primary: shouldBePrimary,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Step 4: Fetch fresh images from backend to ensure we have the latest state
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const freshImages = response.data.data || response.data;
      onImagesChange(freshImages);
      toast.success('Image uploaded successfully!');
    } catch (err) {
      console.error('Failed to upload image:', err);
      toast.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to upload image' : 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await uploadImage(file);
    }
    e.target.value = ''; // Reset input
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        await uploadImage(file);
      }
    }
  }, [images, productId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const deleteImage = async (imageId: number) => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    try {
      const token = await getToken();
      await axios.delete(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images/${imageId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Fetch fresh images from backend to ensure we have the latest state
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const freshImages = response.data.data || response.data;
      onImagesChange(freshImages);
      toast.success('Image deleted successfully!');
    } catch (err) {
      console.error('Failed to delete image:', err);
      toast.error('Failed to delete image');
    }
  };

  const setPrimaryImage = async (imageId: number) => {
    try {
      const token = await getToken();
      await axios.post(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images/${imageId}/set_primary`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Fetch fresh images from backend to ensure we have the latest state
      const response = await axios.get(
        `${API_BASE_URL}/api/v1/admin/products/${productId}/images`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const freshImages = response.data.data || response.data;
      onImagesChange(freshImages);
      
      toast.success('Primary image updated!');
    } catch (err) {
      console.error('Failed to set primary image:', err);
      toast.error('Failed to set primary image');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Product Images</h2>
      
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? 'border-tsPrimary bg-red-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center">
            <Loader className="w-12 h-12 text-tsPrimary animate-spin mb-3" />
            <p className="text-gray-600">Uploading...</p>
          </div>
        ) : (
          <>
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium mb-1">
              Drag & drop images here, or click to select
            </p>
            <p className="text-sm text-gray-500 mb-4">
              PNG, JPG, GIF, WEBP up to 10MB
            </p>
            <label className="inline-flex items-center px-4 py-2 bg-tsPrimary text-white rounded-lg hover:bg-primary-dark cursor-pointer transition">
              <Upload className="w-5 h-5 mr-2" />
              Select Images
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </>
        )}
      </div>

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="mt-6">
          <p className="text-sm text-gray-600 mb-3">
            {images.length} image{images.length !== 1 ? 's' : ''} uploaded
            {images.find(img => img.primary) && (
              <span className="ml-2 text-gray-500">
                (Click the star to set primary image)
              </span>
            )}
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {images.map((image) => (
              <div
                key={image.id}
                className="border-2 border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition bg-white p-3"
              >
                {/* Image Container with Primary Badge Overlay */}
                <div className="w-full bg-white mb-3 relative" style={{ aspectRatio: '1/1' }}>
                  <img
                    src={image.url}
                    alt={image.alt_text || 'Product image'}
                    className="w-full h-full"
                    style={{ 
                      objectFit: 'contain',
                      backgroundColor: 'white'
                    }}
                    onError={(e) => {
                      console.error('❌ Image failed to load:', image.url);
                      e.currentTarget.style.border = '2px solid red';
                    }}
                    onLoad={() => {
                      // Image loaded successfully
                    }}
                  />
                  {/* Primary Badge - Overlay on image */}
                  {image.primary && (
                    <div className="absolute top-2 left-2 inline-flex items-center bg-yellow-500 text-white text-xs font-semibold px-2 py-1 rounded shadow-md">
                      <Star className="w-3 h-3 mr-1" fill="currentColor" />
                      Primary
                    </div>
                  )}
                </div>
                
                {/* Action Buttons - Same for all images */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setPrimaryImage(image.id)}
                    disabled={image.primary}
                    className={`w-full text-xs py-2 px-2 rounded transition flex items-center justify-center gap-1 ${
                      image.primary
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-yellow-500 hover:text-white'
                    }`}
                    title={image.primary ? 'Already primary' : 'Set as primary'}
                  >
                    <Star className="w-3 h-3" fill={image.primary ? 'currentColor' : 'none'} />
                    {image.primary ? 'Primary' : 'Set Primary'}
                  </button>
                  
                  <button
                    onClick={() => deleteImage(image.id)}
                    className="w-full text-xs py-2 px-2 rounded bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-1"
                    title="Delete image"
                  >
                    <X className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {images.length === 0 && !uploading && (
        <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="h-44 rounded-lg overflow-hidden border border-gray-200 bg-white">
            <PlaceholderImage variant="detail" className="bg-gray-100" />
          </div>
          <p className="text-center text-gray-500 mt-3 text-sm">
            No images uploaded yet. Add some images to showcase your product!
          </p>
        </div>
      )}
    </div>
  );
}

