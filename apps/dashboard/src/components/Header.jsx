import rsacLogo from '../assets/images/upavp-mark.png'
import upLogo from '../assets/images/up-logo.png'
import rsacMark from '../assets/images/rsaclogo.jpg'
import '../style/Header.css'

function Header() {
  return (
    <header className="site-header">
      <img className="site-header__logo" src={rsacLogo} alt="Remote Sensing Applications Centre logo" />
      <div className="site-header__identity">
        <p className="site-header__eyebrow">UP Housing and Development Board</p>
        <p className="site-header__title">Hamara Prayas Appka Awas</p>
        {/* <p className="site-header__subtitle">Remote Sensing Applications Centre - Uttar Pradesh</p> */}
      </div>
      <div className="site-header__partner-logos" aria-label="Partner organizations">
        <img src={upLogo} alt="Uttar Pradesh Government logo" />
        <img src={rsacMark} alt="Remote Sensing Applications Centre logo" />
      </div>
    </header>
  )
}

export default Header
