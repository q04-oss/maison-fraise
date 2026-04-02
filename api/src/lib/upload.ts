import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({ secure: true }); // uses CLOUDINARY_URL env var automatically

export async function uploadMedia(base64Data: string, resourceType: 'image' | 'video'): Promise<string> {
  const dataUri = `data:${resourceType === 'video' ? 'video/mp4' : 'image/jpeg'};base64,${base64Data}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: resourceType,
    folder: 'maison-fraise',
  });
  return result.secure_url;
}
