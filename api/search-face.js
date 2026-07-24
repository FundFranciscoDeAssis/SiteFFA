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
  // ROTA DE DOWNLOAD DIRETO VIA PROXY (Resolve CORS e força o download)
  if (req.method === "GET") {
    const { fileUrl } = req.query;
    if (!fileUrl) {
      return res.status(400).send("URL da foto nao fornecida.");
    }

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Erro ao buscar imagem no S3");

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `attachment; filename="Foto_Colonia_${Date.now()}.jpg"`);
      return res.send(buffer);
    } catch (error) {
      console.error("Erro no proxy de download:", error);
      return res.status(500).send("Erro ao baixar arquivo.");
    }
  }

  // ROTA DE BUSCA POR RECONHECIMENTO FACIAL
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
      MaxFaces: 500,
    });

    const response = await rekognition.send(command);

    if (!response.FaceMatches || response.FaceMatches.length === 0) {
      return res.status(200).json({ photos: [] });
    }

    const bucket = process.env.AWS_S3_BUCKET || "9-colonia-ferias-fotos";

    // Como as fotos estão na raiz, o ExternalImageId é diretamente a Key do S3
    const photoUrls = await Promise.all(
      response.FaceMatches.map(async (match) => {
        let key = match.Face.ExternalImageId;

        // Trata eventuais trocas de underline por barra caso tenham sido indexadas assim
        if (key.includes("Dia")) {
          key = key.replace(/^Dia\d+[\/_]/, ""); 
        }

        try {
          const commandGetObject = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          });
          return await getSignedUrl(s3, commandGetObject, { expiresIn: 3600 });
        } catch (err) {
          console.error(`Erro ao gerar presigned URL para ${key}:`, err);
          return null;
        }
      })
    );

    // Remove duplicados e nulos
    const validUrls = [...new Set(photoUrls.filter(url => url !== null))];

    return res.status(200).json({ photos: validUrls });
  } catch (error) {
    console.error("Erro no Rekognition:", error);
    return res.status(500).json({ error: error.message || "Erro interno no servidor." });
  }
}