
import { v2 as cloudinary } from 'cloudinary';

if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  throw new Error('Missing Cloudinary environment variable: "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"');
}
if (!process.env.CLOUDINARY_API_KEY) {
  throw new Error('Missing Cloudinary environment variable: "CLOUDINARY_API_KEY"');
}
if (!process.env.CLOUDINARY_API_SECRET) {
  throw new Error('Missing Cloudinary environment variable: "CLOUDINARY_API_SECRET"');
}

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadImageToCloudinary(fileBuffer: Buffer, folder: string): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: 'image' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else if (result) {
          resolve({ url: result.secure_url, publicId: result.public_id });
        } else {
          reject(new Error('Cloudinary upload failed without error or result.'));
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
}

export async function deleteImageFromCloudinary(publicId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        console.error('Cloudinary delete error:', error);
        reject(error);
      } else {
        console.log('Cloudinary delete result:', result);
        resolve();
      }
    });
  });
}

export default cloudinary;
