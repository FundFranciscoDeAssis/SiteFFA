import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

    // 1. Busca rostos semelhantes no Rekognition
    const command = new SearchFacesByImageCommand({
      CollectionId: process.env.AWS_REKOGNITION_COLLECTION_ID || "colonia-ferias-9",
      Image: { Bytes: imageBuffer },
      FaceMatchThreshold: 65, // Mínimo de 65% de similaridade
      MaxFaces: 50,
    });

    const response = await rekognition.send(command);

    if (!response.FaceMatches || response.FaceMatches.length === 0) {
      return res.status(200).json({ photos: [] });
    }

    const bucket = process.env.AWS_S3_BUCKET;

    // 2. Mapeia os arquivos encontrados e localiza o caminho correto no S3
    const photoUrls = await Promise.all(
      response.FaceMatches.map(async (match) => {
        const fileName = match.Face.ExternalImageId;

        // Tenta encontrar em qual pasta (Dia1, Dia2, etc.) o arquivo está gravado no S3
        for (let dia = 1; dia <= 4; dia++) {
          const s3Key = `Dia${dia}/${fileName}`;
          try {
            // Verifica se o objeto existe no bucket
            const checkCommand = new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: s3Key,
              MaxKeys: 1,
            });
            const checkRes = await s3.send(checkCommand);

            if (checkRes.Contents && checkRes.Contents.length > 0) {
              return `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
            }
          } catch (e) {
            // Continua procurando nas outras pastas
          }
        }

        // Caso esteja na raiz
        return `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
      })
    );

    // Filtra URLs duplicadas ou inválidas
    const validUrls = [...new Set(photoUrls.filter((url) => url !== null))];

    return res.status(200).json({ photos: validUrls });
  } catch (error) {
    console.error("Erro Rekognition:", error);
    return res.status(500).json({ error: "Erro ao processar imagem." });
  }
}