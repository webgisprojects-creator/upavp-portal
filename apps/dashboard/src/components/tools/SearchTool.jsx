import { FaSearch } from "react-icons/fa";
import ToolButton from "./ToolButton";

export default function SearchTool(props) {
  return (
    <ToolButton label="Search" {...props}>
      <FaSearch />
    </ToolButton>
  );
}