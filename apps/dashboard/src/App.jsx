import "./App.css";

import Header from "./components/Header";
import Footer from "./components/Footer";
import MapContainer from "./components/MapContainer";

export default function App() {
  return (
    <div className="app-layout">
      <Header />
      <MapContainer />
       <Footer/>
    </div>
  );
}