import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "us-east-1";
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const rekognition = new RekognitionClient({ region, credentials });
const s3 = new S3Client({ region, credentials });

// Função para encontrar a pasta exata onde a foto está no S3
async function findRealS3Key(bucket, fileName) {
  // Se o ID já veio com pasta
  if (fileName.includes("/")) return fileName;

  // Se veio algo como Dia1_IMG_5209.JPG
  let cleanName = fileName;
  if (cleanName.match(/^Dia\d+_/)) {
    cleanName = cleanName.replace(/^(Dia\d+)_/, "$1/");
    return cleanName;
  }

  // Lista de pastas possíveis no S3
  const possiblePaths = [
    `Dia1/${fileName}`,
    `Dia2/${fileName}`,
    `Dia3/${fileName}`,
    `Dia4/${fileName}`,
    fileName // Caso esteja na raiz
  ];

  for (const path of possiblePaths) {
    try {
      // Testa se o arquivo existe nesse caminho exato no S3
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
      return path; // Retorna o primeiro caminho válido encontrado
    } catch (err) {
      // Arquivo não está nessa pasta, tenta a próxima
    }
  }

  return fileName;
}

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

    // Mapeia e descobre a pasta exata de cada foto encontrada
    const photoUrls = await Promise.all(
      response.FaceMatches.map(async (match) => {
        const externalId = match.Face.ExternalImageId;
        const realKey = await findRealS3Key(bucket, externalId);

        try {
          const commandGetObject = new GetObjectCommand({
            Bucket: bucket,
            Key: realKey,
          });
          
          // Gera a URL assinada válida por 1 hora com o caminho da pasta correto
          return await getSignedUrl(s3, commandGetObject, { expiresIn: 3600 });
        } catch (err) {
          console.error(`Erro ao assinar a foto ${realKey}:`, err);
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