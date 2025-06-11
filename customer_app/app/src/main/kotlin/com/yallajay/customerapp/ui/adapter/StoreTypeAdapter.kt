package com.yallajay.customerapp.ui.adapter

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.yallajay.customerapp.R
import com.yallajay.customerapp.databinding.ItemStoreTypeBinding
import com.yallajay.customerapp.model.StoreType

class StoreTypeAdapter(
    private val context: Context,
    private var storeTypes: List<StoreType>,
    private val onItemClicked: (StoreType) -> Unit
) : RecyclerView.Adapter<StoreTypeAdapter.StoreTypeViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StoreTypeViewHolder {
        val binding = ItemStoreTypeBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return StoreTypeViewHolder(binding)
    }

    override fun onBindViewHolder(holder: StoreTypeViewHolder, position: Int) {
        val storeType = storeTypes[position]
        holder.bind(storeType)
        holder.itemView.setOnClickListener {
            onItemClicked(storeType)
        }
    }

    override fun getItemCount(): Int = storeTypes.size

    fun updateData(newStoreTypes: List<StoreType>) {
        storeTypes = newStoreTypes
        notifyDataSetChanged()
    }

    inner class StoreTypeViewHolder(private val binding: ItemStoreTypeBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(storeType: StoreType) {
            binding.textViewStoreTypeName.text = storeType.name
            try {
                val resourceId = context.resources.getIdentifier(
                    storeType.iconIdentifier, "drawable", context.packageName
                )
                if (resourceId != 0) {
                    binding.imageViewStoreTypeIcon.setImageResource(resourceId)
                } else {
                    binding.imageViewStoreTypeIcon.setImageResource(R.drawable.ic_storetype_other) // أيقونة افتراضية
                }
            } catch (e: Exception) {
                binding.imageViewStoreTypeIcon.setImageResource(R.drawable.ic_storetype_other) // أيقونة افتراضية عند الخطأ
            }
        }
    }
}
