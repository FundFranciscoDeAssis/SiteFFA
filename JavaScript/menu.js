const btnMenu = document.querySelector('.btnMenu');
const btnFechar = document.querySelector('.btnFechar');
const menu = document.querySelector('.cabecalho-nav-mobile');
const overlay = document.querySelector('.overlay');

btnMenu.addEventListener('click', () => {
    overlay.classList.add('active');
    menu.classList.add('active');
})

btnFechar.addEventListener('click', () => {
    overlay.classList.remove('active');
    menu.classList.remove('active');
})

overlay.addEventListener('click', () => {
    overlay.classList.remove('active');
    menu.classList.remove('active');
})