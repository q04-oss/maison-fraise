import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadMedia(base64Data: string, resourceType: 'image' | 'video'): Promise<string> {
  const dataUri = `data:${resourceType === 'video' ? 'video/mp4' : 'image/jpeg'};base64,${base64Data}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: resourceType,
    folder: 'box-fraise',
  });
  return result.secure_url;
}
