import axios from "axios";
import { getCache } from "../../utilities/redis-connection.js";

function getImageValue(id) {
  let sum = 0;
  for (let char of id) {
    sum += char.charCodeAt(0);
  }
  return sum % 10;
}

export const getUserInfo = async (socket) => {
  try {
    console.log("hello");
    const getUserData = await getCache(`PL:${socket.data.userInfo.userId}`);
    if (!getUserData) {
      return socket.disconnect(true);
    }

    const userDetails = JSON.parse(getUserData);
    return socket.emit("infoResponse", {
      urId: userDetails.userId,
      urNm: userDetails.name,
      operator_id: userDetails.operatorId,
      bl: Math.floor(Number(userDetails.balance)),
      avIn: userDetails.image,
      crTs: Date.now(),
      rmId: 0,
    });
  } catch (error) {
    console.log(error);
    return socket.disconnect(true);
  }
};

export const getUserDataFromSource = async (token, game_id) => {
  try {
    const data = await axios.get(
      `${process.env.service_base_url}/service/user/detail`,
      {
        headers: {
          token: token,
        },
      }
    );
    const userData = data?.data?.user;
    if (userData) {
      const userId = encodeURIComponent(userData.user_id);
      const { operatorId } = userData;
      const id = `${operatorId}:${userId}`;
      const image = getImageValue(id);
      const finalData = { ...userData, userId, id, game_id, token, image };
      return finalData;
    }
    return;
  } catch (err) {
    console.log(err);
    return false;
  }
};
