import { FaSyncAlt } from "react-icons/fa";
import ToolButton from "./ToolButton";

export default function RefreshTool({ onClick }) {
  return (
    <ToolButton label="Refresh map" onClick={onClick}>
      <FaSyncAlt />
    </ToolButton>
  );
}