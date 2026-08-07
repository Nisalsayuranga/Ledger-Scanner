export class CloudinaryService {
  private static CLOUD_NAME = "lv1tsh6z";
  private static API_KEY = "973447691891444";
  private static API_SECRET = "_-SqbjYOuReD5eM0c4W7Fxz3tSg"; // Only safe in internal tools or via Edge Functions

  /**
   * Generates a SHA-1 hex string for the given message using the Web Crypto API.
   */
  private static async sha1(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Uploads a base64 image or Blob to Cloudinary into a specific folder structure.
   * Target folder path example: "Boralla/2025/01"
   */
  static async uploadImage(fileData: string | Blob, folderPath: string, fileName: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Cloudinary requires parameters to be alphabetically sorted when generating the signature
    // For authenticated upload, we need: folder, public_id, timestamp
    const publicId = fileName.replace(/\.[^/.]+$/, ""); // Remove extension

    // String to sign: folder=Boralla/2025/01&public_id=page_1&timestamp=1234567890
    const paramsToSign = `folder=${folderPath}&public_id=${publicId}&timestamp=${timestamp}`;
    
    const signature = await this.sha1(paramsToSign + this.API_SECRET);

    const formData = new FormData();
    formData.append("file", fileData);
    formData.append("api_key", this.API_KEY);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);
    formData.append("folder", folderPath);
    formData.append("public_id", publicId);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${this.CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Cloudinary Upload Failed: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.secure_url;
  }
}
