import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo nao permitido" });
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Imagem nao fornecida" });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    const command = new SearchFacesByImageCommand({
      CollectionId: process.env.AWS_REKOGNITION_COLLECTION_ID || "colonia-ferias-9",
      Image: { Bytes: imageBuffer },
      FaceMatchThreshold: 80,
      MaxFaces: 50,
    });

    const response = await rekognition.send(command);

    if (!response.FaceMatches || response.FaceMatches.length === 0) {
      return res.status(200).json({ photos: [] });
    }

    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || "us-east-1";

    const photoUrls = response.FaceMatches.map((match) => {
      const externalId = match.Face.ExternalImageId;
      const s3Key = externalId.replace(/_/g, "/");
      return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
    });

    return res.status(200).json({ photos: photoUrls });
  } catch (error) {
    console.error("Erro Rekognition:", error);
    return res.status(500).json({ error: "Erro ao processar imagem." });
  }
}