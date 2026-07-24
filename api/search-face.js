import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";

const region = process.env.AWS_REGION || "us-east-1";
const rekognition = new RekognitionClient({
  region,
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
      FaceMatchThreshold: 65,
      MaxFaces: 50,
    });

    const response = await rekognition.send(command);

    if (!response.FaceMatches || response.FaceMatches.length === 0) {
      return res.status(200).json({ photos: [] });
    }

    const bucket = process.env.AWS_S3_BUCKET || "9-colonia-ferias-fotos";

    const photoUrls = response.FaceMatches.map((match) => {
      let externalId = match.Face.ExternalImageId;
      
      // Se o ID original do Rekognition tiver alterado barras por underscores
      let s3Key = externalId;

      // Trata casos em que a pasta venha separada por underline ex: Dia1_IMG_5119.JPG -> Dia1/IMG_5119.JPG
      if (s3Key.includes("_") && !s3Key.includes("/")) {
        // Se começar com Dia1, Dia2, Dia3, Dia4
        s3Key = s3Key.replace(/^(Dia\d+)_/, "$1/");
      }

      return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
    });

    const validUrls = [...new Set(photoUrls)];

    return res.status(200).json({ photos: validUrls });
  } catch (error) {
    console.error("Erro no Rekognition:", error);
    return res.status(500).json({ error: error.message || "Erro interno no servidor." });
  }
}