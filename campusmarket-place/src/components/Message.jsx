export default function Message({ text, isError }) {
  if (!text) return null;
  return (
    <div className={`msg-box ${isError ? "error" : "info"}`}>
      {text}
    </div>
  );
}
