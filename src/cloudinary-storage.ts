import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

export interface CloudinaryStorageConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder?: string;
}

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  bytes?: number;
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim();
  return trimmed || undefined;
}

export function resolveCloudinaryConfig(
  env: NodeJS.ProcessEnv = process.env
): CloudinaryStorageConfig | null {
  const cloudName = cleanOptional(env.CLOUDINARY_CLOUD_NAME);
  const apiKey = cleanOptional(env.CLOUDINARY_API_KEY);
  const apiSecret = cleanOptional(env.CLOUDINARY_API_SECRET);
  const hasAny = !!(cloudName || apiKey || apiSecret);

  if (!hasAny) return null;
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn(
      "[TomorrowOS] incomplete Cloudinary config; falling back to local uploads."
    );
    return null;
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: cleanOptional(env.CLOUDINARY_FOLDER)
  };
}

function configureCloudinary(config: CloudinaryStorageConfig): void {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true
  });
}

export async function uploadBufferToCloudinary(
  body: Buffer,
  options: {
    config: CloudinaryStorageConfig;
    publicId: string;
    filename: string;
  }
): Promise<CloudinaryUploadResult> {
  configureCloudinary(options.config);

  const publicId = options.config.folder
    ? `${options.config.folder.replace(/^\/+|\/+$/g, "")}/${options.publicId}`
    : options.publicId;

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        public_id: publicId,
        overwrite: true,
        unique_filename: false,
        use_filename: false,
        filename_override: options.filename
      },
      (err, uploadResult) => {
        if (err) {
          reject(err);
          return;
        }
        if (!uploadResult) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve(uploadResult);
      }
    );
    stream.end(body);
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type,
    bytes: result.bytes
  };
}

export async function deleteCloudinaryAsset(
  config: CloudinaryStorageConfig,
  publicId: string,
  resourceType = "image"
): Promise<void> {
  configureCloudinary(config);
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType
  });
}

/** Lightweight credential / reachability check for CMS status UI. */
export async function pingCloudinary(
  config: CloudinaryStorageConfig
): Promise<void> {
  configureCloudinary(config);
  await cloudinary.api.ping();
}
