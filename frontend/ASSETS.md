# Assets de interface

- Ícones: lucide-react, projeto Lucide, https://lucide.dev, licença ISC incluída no pacote. Importações nomeadas permitem remover ícones não utilizados no build.
- Cena 3D: composição original em CSS, sem imagens, vídeo, canvas, WebGL ou biblioteca de animação. Transições de transform e opacity; entrada finita e inclinação por ponteiro limitada por requestAnimationFrame. Sem animação contínua quando o usuário está inativo.
- Fonte: Inter quando disponível no sistema; fallback Arial. Nenhum arquivo de fonte externo é baixado.
- Marca: logo fornecida pelo usuário em `public/image.png`, preservada sem alterações. O componente `BrandLogo` usa Next Image e enquadramento CSS das margens transparentes, mantendo a proporção original.
