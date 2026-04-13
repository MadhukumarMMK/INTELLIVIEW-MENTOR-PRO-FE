import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axiosInstance";

export default function HistoryTable() {
  const [history, setHistory] = useState([]);
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHistory = async () => {
      const res = await axios.get(`/interviews/history/${user.roll_no}`);
      setHistory(res.data);
    };
    fetchHistory();
  }, [user.roll_no]);

  return (
    <div className="history-table v2-card">
      <h3>Recent Interview Performance</h3>
      <table>
        <thead>
          <tr>
            <th>Technology</th>
            <th>Level</th>
            <th>Accuracy</th>
            <th>Confidence</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr key={item._id}>
              <td>{item.technology_name}</td>
              <td>{item.level}</td>
              <td>{item.overall_analysis[0]?.score || 0}%</td>
              <td>{item.emotions?.neutral > 0.5 ? "High" : "Low"}</td>
              <td>
                <button onClick={() => navigate(`/report/${item._id}`)}>View Report</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}