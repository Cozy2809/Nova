// Aplicaciones que NOVA puede abrir (botones y órdenes de voz). El renderer solo envía el 'id'; main decide cómo abrirla.
export const APPS = [
  { id: 'discord', label: 'Discord', aliases: ['discord'] },
  { id: 'spotify', label: 'Spotify', aliases: ['spotify', 'musica'] },
  { id: 'youtube', label: 'YouTube', aliases: ['youtube', 'you tube'] },
  { id: 'claude', label: 'Claude', aliases: ['claude'] },
  { id: 'twitch', label: 'Twitch', aliases: ['twitch'] },
  { id: 'calculadora', label: 'Calculadora', aliases: ['calculadora', 'calculator'] },
  { id: 'bloc', label: 'Bloc de notas', aliases: ['bloc de notas', 'block de notas', 'bloc', 'notepad'] },
  { id: 'onenote', label: 'OneNote', aliases: ['onenote', 'one note'] },
  { id: 'explorador', label: 'Explorador', aliases: ['explorador de archivos', 'explorador', 'mis archivos'] },
  { id: 'tareas', label: 'Administrador de tareas', aliases: ['administrador de tareas', 'gestor de tareas', 'task manager'] },
  { id: 'minecraft', label: 'Minecraft', aliases: ['minecraft'] },
  { id: 'steam', label: 'Steam', aliases: ['steam'] },
  { id: 'chrome', label: 'Navegador', aliases: ['chrome', 'google chrome', 'navegador', 'edge', 'microsoft edge'] },
];
