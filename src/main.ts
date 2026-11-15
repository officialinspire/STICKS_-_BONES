import './styles.css';
import { renderTitleScreen } from './ui/title-screen';

const root = document.getElementById('app');
if (root) renderTitleScreen(root);
