import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "us-east-1";
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const rekognition = new RekognitionClient({ region, credentials });
const s3 = new S3Client({ region, credentials });

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

    // Para cada foto reconhecida, tenta montar a chave com pasta e gera Presigned URL
    const photoUrls = await Promise.all(
      response.FaceMatches.map(async (match) => {
        let externalId = match.Face.ExternalImageId;
        
        // Garante a troca de underline por barra se for o padrão de pasta
        let s3Key = externalId;
        if (s3Key.includes("_") && !s3Key.includes("/")) {
          s3Key = s3Key.replace(/^(Dia\d+)_/, "$1/");
        }

        try {
          const getObjectParams = {
            Bucket: bucket,
            Key: s3Key,
          };
          
          // Gera uma URL temporária válida por 60 minutos
          const commandGetObject = new GetObjectCommand(getObjectParams);
          return await getSignedUrl(s3, commandGetObject, { expiresIn: 3600 });
        } catch (err) {
          console.error("Erro ao gerar URL assinada:", err);
          return null;
        }
      })
    );

    const validUrls = [...new Set(photoUrls.filter(url => url !== null))];

    return res.status(200).json({ photos: validUrls });
  } catch (error) {
    console.error("Erro no Rekognition:", error);
    return res.status(500).json({ error: error.message || "Erro interno no servidor." });
  }
}